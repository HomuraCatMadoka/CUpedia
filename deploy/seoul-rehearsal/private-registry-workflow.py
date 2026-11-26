"""Publish through the fixed SSH endpoint, or invoke the isolated Seoul rehearsal."""
from contextlib import contextmanager
import os
from pathlib import Path
import re
import socketserver
import ssl
import subprocess
import sys
import tempfile
import threading
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ADDRESS = "127.0.0.1:5105"
REPOSITORY = "cupedia-rehearsal"
DIGEST = r"sha256:[0-9a-f]{64}"
REVISION = r"[0-9a-f]{40}"
ACCEPT = ", ".join((
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
))

def ssh_args(temporary):
    host = os.environ["SEOUL_TRIAL_HOST"]
    port = os.environ["SEOUL_TRIAL_PORT"]
    if not re.fullmatch(r"[A-Za-z0-9.-]+", host) or not port.isdigit() or not 1 <= int(port) <= 65535:
        raise ValueError("invalid rehearsal host")
    key = temporary / "identity"
    known = temporary / "known_hosts"
    key.write_text(os.environ["SEOUL_TRIAL_SSH_KEY"].strip()+"\n")
    known.write_text(os.environ["SEOUL_TRIAL_HOST_KEY"].strip()+"\n")
    return [
        "ssh", "-F", "/dev/null", "-T", "-i", str(key), "-p", port,
        "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
        "-o", "ConnectTimeout=12", "-o", "ServerAliveInterval=10",
        "-o", "StrictHostKeyChecking=yes", "-o", "HostKeyAlgorithms=ssh-ed25519",
        "-o", "HostKeyAlias=seoul-private-registry-rehearsal",
        "-o", f"UserKnownHostsFile={known}", f"cupedia-private-trial@{host}",
    ]

@contextmanager
def local_bridge(ssh):
    class RegistryConnection(socketserver.BaseRequestHandler):
        def handle(self):
            with subprocess.Popen(ssh,stdin=self.request,stdout=self.request,stderr=subprocess.DEVNULL) as connection:
                try:
                    connection.wait(timeout=720)
                except subprocess.TimeoutExpired:
                    connection.kill()
                    connection.wait()

    with socketserver.ThreadingTCPServer(("127.0.0.1",5105), RegistryConnection) as server:
        server.daemon_threads = True
        worker = threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        try:
            yield
        finally:
            server.shutdown()
            worker.join(timeout=5)

def registry_request(context, path, method="GET"):
    request = Request("https://"+ADDRESS+path, method=method, headers={"Accept":ACCEPT})
    try:
        with urlopen(request, context=context, timeout=18) as response:
            return response.status
    except HTTPError as failure:
        return failure.code

def publish(temporary, ssh, revision):
    tag = f"{ADDRESS}/{REPOSITORY}:rehearsal-{revision}"
    ca = temporary / "registry-ca.crt"
    ca.write_text(os.environ["SEOUL_TRIAL_REGISTRY_CA"].strip()+"\n")
    trust = f"/etc/docker/certs.d/{ADDRESS}"
    subprocess.run(["sudo","-n","install","-d","-m0755",trust],check=True)
    subprocess.run(["sudo","-n","install","-m0644",str(ca),f"{trust}/ca.crt"],check=True)
    context = ssl.create_default_context(cafile=str(ca))
    docker_config = temporary/"docker"
    docker_config.mkdir(mode=0o700)
    docker = ["docker","--config",str(docker_config)]
    password = os.environ["SEOUL_TRIAL_REGISTRY_WRITER"]
    if not re.fullmatch(r"[!-~]{20,250}",password):
        raise ValueError("invalid publisher credential format")
    with local_bridge(ssh):
        if registry_request(context,"/v2/") != 401:
            raise RuntimeError("registry did not reject anonymous access before publication")
        auth=subprocess.run([*docker,"login",ADDRESS,"--username","writer","--password-stdin"],
                            input=password.encode(),capture_output=True,timeout=30)
        if auth.returncode:
            raise RuntimeError("publisher could not authenticate to the private registry")
        push=subprocess.run([*docker,"push",tag],capture_output=True,text=True,timeout=600)
        if push.returncode:
            error = re.search(r"denied|unauthorized|x509|timeout|connection refused", push.stderr, re.I)
            raise RuntimeError("private image push failed" + (f" ({error.group()})" if error else ""))
        found=re.findall(r"digest:\s*(sha256:[0-9a-f]{64})\b",push.stdout)
        if len(found)!=1:
            raise RuntimeError("registry push did not return a unique immutable digest")
        digest=found[0]
        if registry_request(context,f"/v2/{REPOSITORY}/manifests/{digest}",method="HEAD") != 401:
            raise RuntimeError("anonymous access to the published digest was not denied")
    with open(os.environ["GITHUB_OUTPUT"],"a") as output:
        output.write(f"digest={digest}\n")
    print(f"Private image published and anonymous access denied for {digest}",flush=True)

def rehearse(ssh, revision):
    digest=os.environ.get("PUBLISHED_DIGEST","")
    if not re.fullmatch(DIGEST,digest):
        raise ValueError("invalid published digest")
    data=f"CUPEDIA-PRIVATE-REHEARSAL-1\n{digest}\n{revision}\n".encode()
    result=subprocess.run(ssh,input=data,timeout=480)
    if result.returncode:
        raise RuntimeError("Seoul isolated rehearsal did not pass")

def main():
    os.umask(0o077)
    revision=os.environ.get("GITHUB_SHA","")
    if not re.fullmatch(REVISION,revision):
        sys.exit("invalid rehearsal source revision")
    with tempfile.TemporaryDirectory(prefix="cupedia-private-github-") as work:
        temporary=Path(work)
        ssh=ssh_args(temporary)
        if sys.argv[1:] == ["publish"]:
            publish(temporary,ssh,revision)
        elif sys.argv[1:] == ["rehearse"]:
            rehearse(ssh,revision)
        else:
            sys.exit("expected publish or rehearse")

if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error) if type(error) in (RuntimeError, ValueError) else "Private rehearsal command failed.",file=sys.stderr)
        raise SystemExit(1)
