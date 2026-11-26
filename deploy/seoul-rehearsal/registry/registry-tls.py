#!/usr/bin/env python3
"""Manage the dedicated localhost registry CA and its disposable TLS leaves."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import ssl
import stat
import subprocess
import sys
import tempfile
import time


REGISTRY = Path("/srv/cupedia-private-registry-rehearsal-20261126")
CA_PARENT = Path("/etc/cupedia-registry-tls")
PROJECT = "cupedia-private-registry-rehearsal"
BIND_TARGET = "/etc/nginx/rehearsal-tls"
ADDRESS = "127.0.0.1"
PORT = 5105
LEAF_DAYS = 90
RENEW_WITHIN = 21 * 86400
GENERATION = re.compile(r"generations/[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}")


class RegistryError(Exception):
    pass


def command(*arguments, timeout=30, check=True):
    return subprocess.run(
        [str(argument) for argument in arguments], stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout, check=check,
    )


def check_directory(path, forbidden_mode=0o077):
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid()
            or info.st_mode & forbidden_mode):
        raise RegistryError("Expected an operator-owned directory with restrictive permissions.")


def private_key(path):
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
            or info.st_mode & 0o077):
        raise RegistryError("Expected a private regular key owned by the operator.")


def regular_certificate(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RegistryError("Expected a regular certificate file.")


def fingerprint(certificate):
    der = command("openssl", "x509", "-in", certificate, "-outform", "DER").stdout
    return hashlib.sha256(der).hexdigest()


def report(certificate, changed):
    dates = command("openssl", "x509", "-in", certificate, "-noout", "-dates").stdout.decode()
    metadata = dict(line.split("=", 1) for line in dates.splitlines())
    print(json.dumps({"changed": changed, "sha256": fingerprint(certificate), **metadata}))


class RegistryTLS:
    def __init__(self, registry=REGISTRY, ca_parent=CA_PARENT, port=PORT):
        self.registry = registry
        self.live = registry / "tls" / "live"
        self.generations = self.live / "generations"
        self.current = self.live / "current"
        self.ca_parent = ca_parent
        self.ca_dir = ca_parent / "ca"
        self.ca = self.ca_dir / "ca.crt"
        self.ca_key = self.ca_dir / "ca.key"
        self.port = port

    @contextmanager
    def locked(self):
        check_directory(self.live)
        fd = os.open(self.live / ".renew.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "r+b") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield

    def ensure_ca(self, create=False):
        check_directory(self.ca_parent)
        if create and not self.ca_dir.exists() and not self.ca_dir.is_symlink():
            with tempfile.TemporaryDirectory(prefix=".ca-", dir=self.ca_parent) as staging:
                bundle = Path(staging) / "bundle"
                bundle.mkdir(mode=0o700)
                command(
                    "openssl", "req", "-new", "-x509", "-newkey", "rsa:3072", "-noenc",
                    "-sha256", "-days", "3650", "-subj", "/CN=CUpedia Local Registry CA",
                    "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
                    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
                    "-addext", "subjectKeyIdentifier=hash",
                    "-keyout", bundle / "ca.key", "-out", bundle / "ca.crt",
                )
                private_key(bundle / "ca.key")
                command("openssl", "verify", "-CAfile", bundle / "ca.crt", bundle / "ca.crt")
                bundle.rename(self.ca_dir)
        check_directory(self.ca_dir)
        private_key(self.ca_key)
        regular_certificate(self.ca)
        check = command(
            "openssl", "x509", "-in", self.ca, "-noout", "-checkend",
            (LEAF_DAYS + 1) * 86400, check=False,
        )
        if check.returncode != 0:
            raise RegistryError("Registry CA lifetime is too short. Prepare a separate CA rollover.")

    def current_target(self):
        target = os.readlink(self.current)
        if not GENERATION.fullmatch(target):
            raise RegistryError("Current registry leaf does not point to an owned generation.")
        check_directory(self.live / target)
        return target

    def set_current(self, target):
        if not GENERATION.fullmatch(target):
            raise RegistryError("Cannot select an unexpected leaf generation.")
        with tempfile.TemporaryDirectory(prefix=".switch-", dir=self.live) as staging:
            link = Path(staging) / "current"
            link.symlink_to(target)
            os.replace(link, self.current)

    def verify_leaf(self, certificate, key):
        regular_certificate(certificate)
        private_key(key)
        command("openssl", "verify", "-purpose", "sslserver", "-verify_ip", ADDRESS,
                "-CAfile", self.ca, certificate)
        cert_key = command("openssl", "x509", "-in", certificate, "-pubkey", "-noout").stdout
        file_key = command("openssl", "pkey", "-in", key, "-pubout").stdout
        if cert_key != file_key:
            raise RegistryError("Registry certificate and signing key do not match.")

    def issue_leaf(self):
        check_directory(self.generations)
        generation = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(6)
        with tempfile.TemporaryDirectory(prefix=".leaf-", dir=self.generations) as staging:
            root = Path(staging)
            bundle = root / "bundle"
            bundle.mkdir(mode=0o700)
            extensions = root / "leaf.ext"
            extensions.write_text(
                "[leaf]\n"
                "basicConstraints=critical,CA:FALSE\n"
                "keyUsage=critical,digitalSignature,keyEncipherment\n"
                "extendedKeyUsage=serverAuth\n"
                "subjectAltName=IP:127.0.0.1\n"
                "subjectKeyIdentifier=hash\n"
                "authorityKeyIdentifier=keyid,issuer\n",
                encoding="ascii",
            )
            key = bundle / "server.key"
            certificate = bundle / "server.crt"
            csr = root / "leaf.csr"
            command("openssl", "req", "-new", "-newkey", "rsa:2048", "-noenc",
                    "-sha256", "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", csr)
            command("openssl", "x509", "-req", "-in", csr, "-CA", self.ca, "-CAkey",
                    self.ca_key, "-set_serial", "0x" + secrets.token_hex(16), "-sha256",
                    "-days", LEAF_DAYS, "-extfile", extensions, "-extensions", "leaf",
                    "-out", certificate)
            self.verify_leaf(certificate, key)
            bundle.rename(self.generations / generation)
        return "generations/" + generation

    def frontend(self):
        ids = command(
            "docker", "ps", "--quiet", "--no-trunc",
            "--filter", f"label=com.docker.compose.project={PROJECT}",
            "--filter", "label=com.docker.compose.service=frontend",
        ).stdout.decode().split()
        if len(ids) != 1 or not re.fullmatch(r"[a-f0-9]{64}", ids[0]):
            raise RegistryError("Expected one running registry frontend.")
        cid = ids[0]
        root = command(
            "docker", "container", "inspect", "--format",
            '{{index .Config.Labels "com.docker.compose.project.working_dir"}}', cid
        ).stdout.decode().strip()
        mounts = json.loads(command(
            "docker", "container", "inspect", "--format", "{{json .Mounts}}", cid
        ).stdout)
        ports = json.loads(command(
            "docker", "container", "inspect", "--format", "{{json .NetworkSettings.Ports}}", cid
        ).stdout)
        expected_mount = [
            m for m in mounts
            if m.get("Destination") == BIND_TARGET and m.get("Source") == str(self.live)
            and m.get("Type") == "bind" and m.get("RW") is False
        ]
        expected_ports = {"5443/tcp": [{"HostIp": ADDRESS, "HostPort": str(self.port)}]}
        if root != str(self.registry) or len(expected_mount) != 1 or {
            key: value for key, value in ports.items() if value
        } != expected_ports:
            raise RegistryError("Running registry frontend does not match the expected isolated layout.")
        return cid

    def served_fingerprint(self):
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.load_verify_locations(cafile=str(self.ca))
        connection = http.client.HTTPSConnection(ADDRESS, self.port, context=context, timeout=3)
        try:
            connection.connect()
            certificate = connection.sock.getpeercert(binary_form=True)
            connection.request("GET", "/v2/")
            response = connection.getresponse()
            if (response.status != 401
                    or response.getheader("Docker-Distribution-Api-Version") != "registry/2.0"):
                raise RegistryError("Registry did not return the expected anonymous challenge.")
            return hashlib.sha256(certificate).hexdigest()
        finally:
            connection.close()

    def wait_served(self, certificate):
        expected = fingerprint(certificate)
        deadline = time.monotonic() + 12
        stable_since = None
        while time.monotonic() < deadline:
            try:
                matching = self.served_fingerprint() == expected
            except (OSError, http.client.HTTPException, RegistryError):
                matching = False
            now = time.monotonic()
            if not matching:
                stable_since = None
            elif stable_since is None:
                stable_since = now
            elif now - stable_since >= 1.0:
                return
            time.sleep(0.3)
        raise RegistryError("Registry failed the served certificate and anonymous access checks.")

    def reload(self, cid):
        command("docker", "exec", cid, "/usr/sbin/nginx", "-t", "-q", timeout=12)
        command("docker", "exec", cid, "/usr/sbin/nginx", "-s", "reload", timeout=12)

    def prepare(self):
        check_directory(self.registry, forbidden_mode=0o022)
        self.ca_parent.mkdir(mode=0o700, exist_ok=True)
        self.live.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.generations.mkdir(mode=0o700, exist_ok=True)
        with self.locked():
            self.ensure_ca(create=True)
            if self.current.is_symlink():
                target = self.current_target()
                changed = False
            else:
                if self.current.exists():
                    raise RegistryError("Refusing to replace an existing non-link certificate path.")
                target = self.issue_leaf()
                self.set_current(target)
                changed = True
            bundle = self.live / target
            self.verify_leaf(bundle / "server.crt", bundle / "server.key")
            report(bundle / "server.crt", changed)

    def check(self):
        self.frontend()
        target = self.live / self.current_target()
        self.verify_leaf(target / "server.crt", target / "server.key")
        self.wait_served(target / "server.crt")
        report(target / "server.crt", False)

    def renew(self, force=False):
        with self.locked():
            self.ensure_ca()
            cid = self.frontend()
            old_target = self.current_target()
            old_certificate = self.live / old_target / "server.crt"
            expiry = command("openssl", "x509", "-in", old_certificate, "-noout",
                             "-checkend", RENEW_WITHIN, check=False)
            if not force and expiry.returncode == 0:
                # Reconcile a prior process crash between pointer selection and nginx reload.
                try:
                    already_served = self.served_fingerprint() == fingerprint(old_certificate)
                except (OSError, http.client.HTTPException, RegistryError):
                    already_served = False
                if not already_served:
                    self.verify_leaf(old_certificate, self.live / old_target / "server.key")
                    self.reload(cid)
                    self.wait_served(old_certificate)
                report(old_certificate, False)
                return

            new_target = self.issue_leaf()
            new_bundle = self.live / new_target
            new_certificate = new_bundle / "server.crt"
            if fingerprint(new_certificate) == fingerprint(old_certificate):
                raise RegistryError("New registry leaf unexpectedly matches the old leaf.")
            try:
                self.set_current(new_target)
                self.reload(cid)
                self.wait_served(new_certificate)
            except BaseException:
                try:
                    self.set_current(old_target)
                    self.reload(self.frontend())
                    self.wait_served(old_certificate)
                    shutil.rmtree(new_bundle)
                except BaseException:
                    raise RegistryError("Renewal failed. Registry recovery needs operator verification.") from None
                raise RegistryError("Renewal failed. The previous served certificate was restored.") from None
            report(new_certificate, True)


def stop(_signal, _frame):
    raise InterruptedError()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "check", "renew"])
    parser.add_argument("--force", action="store_true", help="Issue a new leaf even before the renewal window")
    args = parser.parse_args()
    if args.force and args.action != "renew":
        parser.error("--force only applies to renew")
    if os.geteuid() != 0:
        parser.error("This operation requires root")
    os.umask(0o077)
    import signal
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGHUP, stop)
    registry = RegistryTLS()
    try:
        if args.action == "renew":
            registry.renew(args.force)
        else:
            getattr(registry, args.action)()
    except RegistryError as error:
        print(error, file=sys.stderr)
        return 1
    except (OSError, ValueError, TypeError, subprocess.SubprocessError):
        print("Registry TLS operation failed before verification.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
