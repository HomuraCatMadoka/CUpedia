#!/usr/bin/python3 -I
"""Provision isolated SSH identities and rotate localhost registry Basic auth."""
import argparse
import base64
import fcntl
from http.client import HTTPSConnection
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import ssl
import stat
import subprocess
import sys
import tempfile
import time

ROOT = Path("/srv/cupedia-private-registry-rehearsal-20261126")
ROTATION = ROOT / ".account-rotation"
WRITER = "cupedia-ci-registry"
DEPLOYER = "cupedia-ci-rehearsal"
SUDO_RULE = Path("/etc/sudoers.d/cupedia-ci-rehearsal")
DOCKER = "/usr/bin/docker"
ROLES = ("reader", "writer")
FILES = {
    "reader-password": 0o600,
    "writer-password": 0o600,
    "auth/reader.htpasswd": 0o444,
    "auth/writer.htpasswd": 0o444,
}
PASSWORD = re.compile(rb"[A-Za-z0-9_-]{32,70}\n")
HASH = rb"\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}"
REGISTRY = "127.0.0.1"
PORT = 5105
REPOSITORY = "cupedia-rehearsal"
CLIENT_CA = Path(f"/etc/docker/certs.d/{REGISTRY}:{PORT}/ca.crt")
MISSING_WRITER = "writer-password.was-absent"


class AccountError(Exception):
    pass


def command(args, *, label, data=None, capture=False, timeout=18, env=None):
    result = subprocess.run(
        args, input=data, stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, timeout=timeout, env=env, check=False,
    )
    if result.returncode:
        raise AccountError(label)
    return result.stdout if capture else None


def secure_path(path, *, directory=False, private=False):
    info = path.lstat()
    expected = stat.S_ISDIR if directory else stat.S_ISREG
    if not expected(info.st_mode) or info.st_uid != 0 or info.st_gid != 0:
        raise AccountError("Unexpected owner or file type for a registry management path.")
    prohibited = 0o077 if private else 0o022
    if stat.S_IMODE(info.st_mode) & prohibited:
        raise AccountError("A registry management path has unexpected access permissions.")
    return info


def atomic_file(path, data, mode, *, validator=None):
    fd, name = tempfile.mkstemp(prefix=".registry-account-", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            os.fchmod(handle.fileno(), mode)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        if validator:
            validator(temporary)
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def ensure_directory(path, mode):
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        secure_path(path, directory=True, private=mode == 0o700)
    path.chmod(mode)


def parse_public_key(path):
    if not stat.S_ISREG(path.lstat().st_mode) or path.stat().st_size > 1024:
        raise AccountError("Provide one regular Ed25519 public key file per identity.")
    contents = path.read_bytes()
    key = re.fullmatch(rb"ssh-ed25519 ([A-Za-z0-9+/]{68})(?: [^\r\n]*)?\n?", contents)
    if not key:
        raise AccountError("Expected a single Ed25519 public key without SSH options.")
    decoded = base64.b64decode(key[1], validate=True)
    header = b"\0\0\0\x0bssh-ed25519\0\0\0\x20"
    if not decoded.startswith(header) or len(decoded) != len(header) + 32:
        raise AccountError("Invalid Ed25519 public key.")
    return b"ssh-ed25519 " + key[1]


def verified_account(user, home):
    try:
        details = pwd.getpwnam(user)
    except KeyError:
        command(
            ["/usr/sbin/useradd", "--system", "--no-create-home", "--user-group",
             "--home-dir", str(home), "--shell", "/bin/sh", user],
            label="Could not create the isolated registry SSH account.",
        )
        details = pwd.getpwnam(user)
    if (
        details.pw_uid == 0 or details.pw_gid == 0 or details.pw_dir != str(home)
        or details.pw_shell != "/bin/sh"
        or set(os.getgrouplist(user, details.pw_gid)) != {details.pw_gid}
    ):
        raise AccountError("An existing account does not match the isolated account layout.")
    status = command(
        ["/usr/bin/passwd", "-S", user], label="Could not verify SSH account password state.",
        capture=True,
    ).split()
    if len(status) < 2 or status[1] != b"L":
        raise AccountError("The SSH account must have a locked password.")


def check_ssh_defaults(user):
    settings = command(
        ["/usr/sbin/sshd", "-T", "-C", f"user={user},host=localhost,addr=127.0.0.1"],
        label="Could not inspect effective SSH settings.", capture=True,
    ).decode("ascii")
    fields = dict(line.split(" ", 1) for line in settings.splitlines() if " " in line)
    expected = {
        "pubkeyauthentication": "yes",
        "usepam": "yes",
        "strictmodes": "yes",
        "authorizedkeyscommand": "none",
        "trustedusercakeys": "none",
        "hostbasedauthentication": "no",
        "gssapiauthentication": "no",
        "permituserenvironment": "no",
        "forcecommand": "none",
        "authenticationmethods": "any",
    }
    if any(fields.get(name) != value for name, value in expected.items()):
        raise AccountError("Effective SSH settings require an operator review for the fixed identities.")
    if fields.get("authorizedkeysfile", "").split() not in (
        [".ssh/authorized_keys"], [".ssh/authorized_keys", ".ssh/authorized_keys2"]
    ):
        raise AccountError("Effective SSH key path requires an operator review.")


def deploy_wrapper(entry):
    # The original command is never interpreted or expanded.
    return (
        "#!/bin/sh\n"
        "if [ -n \"${SSH_ORIGINAL_COMMAND-}\" ] || [ \"$#\" -ne 0 ]; then\n"
        "    printf '%s\\n' 'This SSH identity invokes the isolated rehearsal only.' >&2\n"
        "    exit 1\n"
        "fi\n"
        f"exec /usr/bin/sudo -n -- /usr/bin/python3 -I {entry}\n"
    ).encode("ascii")


def ssh_entry(file, public_key, entry, user):
    data = (
        f'restrict,command="exec {entry}" '.encode("ascii") + public_key
        + f" {user}\n".encode("ascii")
    )
    if file.exists() or file.is_symlink():
        secure_path(file)
        existing = file.read_bytes()
        expected = rb'restrict,command="exec [a-zA-Z0-9 /._-]+" ssh-ed25519 [A-Za-z0-9+/]{68} '
        if not re.fullmatch(expected + user.encode("ascii") + rb"\n", existing):
            raise AccountError("Refusing to replace an unmanaged authorized_keys file.")
    atomic_file(file, data, 0o644)


def check_sudo_policy(entry):
    # sudo -l may return success after printing a denial for an account without a rule.
    writer_policy = subprocess.run(
        ["/usr/bin/sudo", "-n", "-l", "-U", WRITER], capture_output=True,
        env={"LC_ALL": "C", "PATH": "/usr/sbin:/usr/bin:/sbin:/bin"}, timeout=12, check=False,
    )
    denial = f"User {WRITER} is not allowed to run sudo on ".encode("ascii")
    if not (writer_policy.stdout + writer_policy.stderr).strip().startswith(denial):
        raise AccountError("The isolated registry writer has unexpected sudo policy.")

    for user, arguments, expected in (
        (DEPLOYER, ["/usr/bin/python3", "-I", str(entry)], 0),
        (DEPLOYER, ["/usr/bin/python3", "-I", str(entry), "unexpected"], 1),
        (DEPLOYER, ["/bin/sh"], 1),
    ):
        args = ["/usr/bin/sudo", "-n", "-l", "-U", user]
        if arguments:
            args.extend(["--", *arguments])
        result = subprocess.run(
            args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=12, check=False
        )
        if result.returncode != expected:
            raise AccountError("Effective sudo policy did not match the isolated SSH accounts.")


def install_ssh(args):
    writer_key = parse_public_key(args.writer_public_key)
    deploy_key = parse_public_key(args.deploy_public_key)
    if writer_key == deploy_key:
        raise AccountError("Separate Ed25519 keys are required.")
    entry = args.deploy_entry.absolute()
    if entry.parent != ROOT or not re.fullmatch(r"[a-z][a-z0-9-]+\.py", entry.name):
        raise AccountError("The rehearsal handler must be a fixed Python file in the registry root.")
    bridge = ROOT / "registry-writer-bridge.py"
    secure_path(entry)
    if not secure_path(bridge).st_mode & stat.S_IROTH:
        raise AccountError("The fixed writer bridge must be readable by its SSH account.")
    if not secure_path(ROOT, directory=True).st_mode & stat.S_IXOTH:
        raise AccountError("The registry root must permit traversal to its isolated SSH entries.")
    if not secure_path(ROOT.parent, directory=True).st_mode & stat.S_IXOTH:
        raise AccountError("The registry root parent must permit traversal to the isolated SSH entries.")

    for user in (WRITER, DEPLOYER):
        check_ssh_defaults(user)

    # A separate root-owned home per UID. The users can traverse to their public keys,
    # but can't alter their key files, per-user shell configuration, or the server root.
    homes = ROOT / "ci-ssh"
    ensure_directory(homes, 0o755)
    for user in (WRITER, DEPLOYER):
        home = homes / user
        ensure_directory(home, 0o755)
        ensure_directory(home / ".ssh", 0o755)
        verified_account(user, home)

    wrapper = ROOT / "rehearsal-ssh-entry"
    rule = f"{DEPLOYER} ALL=(root) NOPASSWD: /usr/bin/python3 -I {entry}\n".encode("ascii")
    if SUDO_RULE.exists() or SUDO_RULE.is_symlink():
        secure_path(SUDO_RULE)
        if SUDO_RULE.read_bytes() != rule:
            raise AccountError("Refusing to replace an unmanaged or different sudo rule.")
    command(
        ["/usr/sbin/visudo", "-c", "-q"], label="Current sudo configuration did not validate."
    )
    atomic_file(
        SUDO_RULE, rule, 0o440,
        validator=lambda path: command(
            ["/usr/sbin/visudo", "-c", "-q", "-f", str(path)],
            label="Candidate sudo configuration did not validate.",
        ),
    )
    command(
        ["/usr/sbin/visudo", "-c", "-q"], label="Installed sudo configuration did not validate."
    )
    check_sudo_policy(entry)
    atomic_file(wrapper, deploy_wrapper(entry), 0o755)
    ssh_entry(
        homes / WRITER / ".ssh/authorized_keys", writer_key,
        f"/usr/bin/python3 -I {bridge}", WRITER,
    )
    ssh_entry(homes / DEPLOYER / ".ssh/authorized_keys", deploy_key, str(wrapper), DEPLOYER)
    print("Separate fixed SSH identities installed. Verify both connections with their own keys.")


def read_auth_file(root, name, *, staged=False, allow_missing_writer=False):
    path = root / name
    try:
        info = secure_path(path, private=staged or name.endswith("-password"))
    except FileNotFoundError:
        if name == "writer-password" and allow_missing_writer:
            return None
        raise
    if info.st_size > 1024:
        raise AccountError("An authentication file exceeds the expected size.")
    return path.read_bytes()


def read_generation(root, *, staged=False, allow_missing_writer=False):
    generation = {
        name: read_auth_file(root, name, staged=staged, allow_missing_writer=allow_missing_writer)
        for name in FILES
    }
    validate_generation(generation, allow_missing_writer=allow_missing_writer)
    return generation


def validate_generation(generation, *, allow_missing_writer=False):
    for role in ROLES:
        password = generation[f"{role}-password"]
        if role == "writer" and password is None and allow_missing_writer:
            continue
        if password is None or not PASSWORD.fullmatch(password):
            raise AccountError("Registry credential is missing or has an unexpected format.")
    reader, writer = generation["auth/reader.htpasswd"], generation["auth/writer.htpasswd"]
    if not re.fullmatch(rb"writer:" + HASH + rb"\n", writer):
        raise AccountError("Writer ACL must contain only the writer hash.")
    if not re.fullmatch(rb"reader:" + HASH + rb"\n", reader.removesuffix(writer)) or not reader.endswith(writer):
        raise AccountError("Read ACL must contain the reader and the same writer hash.")


def bcrypt_hash(role, password):
    # Ubuntu's htpasswd accepts input on stdin. The local build-time bcrypt
    # package is also supported if Apache utilities are absent.
    if Path("/usr/bin/htpasswd").is_file():
        return command(
            ["/usr/bin/htpasswd", "-n", "-i", "-B", "-C", "12", role],
            label="Could not hash a registry credential.", capture=True, data=password,
        ).strip() + b"\n"
    try:
        import bcrypt
    except ImportError:
        raise AccountError("Install apache2-utils or the system python3-bcrypt package before rotation.") from None
    return role.encode() + b":" + bcrypt.hashpw(password.rstrip(b"\n"), bcrypt.gensalt(rounds=12)) + b"\n"


def new_generation():
    outputs = {f"{role}-password": (secrets.token_urlsafe(36) + "\n").encode() for role in ROLES}
    writer = bcrypt_hash("writer", outputs["writer-password"])
    outputs["auth/writer.htpasswd"] = writer
    outputs["auth/reader.htpasswd"] = bcrypt_hash("reader", outputs["reader-password"]) + writer
    validate_generation(outputs)
    return outputs


def write_generation(path, generation, *, staged=False):
    for name, mode in FILES.items():
        target = path / name
        if generation[name] is None:
            target.unlink(missing_ok=True)
            sync_directory(target.parent)
        else:
            atomic_file(target, generation[name], 0o600 if staged else mode)


def load_stage():
    secure_path(ROTATION, directory=True, private=True)
    for name in ("previous", "next"):
        secure_path(ROTATION / name, directory=True, private=True)
        secure_path(ROTATION / name / "auth", directory=True, private=True)
    marker = ROTATION / "previous" / MISSING_WRITER
    try:
        absent_writer = secure_path(marker, private=True).st_size == 0
    except FileNotFoundError:
        absent_writer = False
    else:
        if not absent_writer:
            raise AccountError("The previous writer absence marker is invalid.")
    previous = read_generation(ROTATION / "previous", staged=True, allow_missing_writer=absent_writer)
    if absent_writer and previous["writer-password"] is not None:
        raise AccountError("The previous writer absence marker conflicts with staged files.")
    return previous, read_generation(ROTATION / "next", staged=True)


def stage_auth():
    if ROTATION.exists() or ROTATION.is_symlink():
        load_stage()
        print("A registry credential rotation is already staged.")
        return
    old = read_generation(ROOT, allow_missing_writer=True)
    probe(old)
    new = new_generation()
    temporary = Path(tempfile.mkdtemp(prefix=".account-stage-", dir=ROOT))
    try:
        for name, generation in (("previous", old), ("next", new)):
            folder = temporary / name
            folder.mkdir(mode=0o700)
            (folder / "auth").mkdir(mode=0o700)
            write_generation(folder, generation, staged=True)
            if generation["writer-password"] is None:
                atomic_file(folder / MISSING_WRITER, b"", 0o600)
        sync_directory(temporary)
        temporary.rename(ROTATION)
        sync_directory(ROOT)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    print("Registry reader and writer rotation staged. The live registry still uses the previous credentials.")


def frontend(args):
    compose = [
        DOCKER, "--host=unix:///var/run/docker.sock", "compose", "--project-directory", str(ROOT),
        "--project-name", "cupedia-private-registry-rehearsal", "--file", str(ROOT / "compose.yaml"),
    ]
    env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root"}
    for name in ("REGISTRY_IMAGE", "NGINX_IMAGE"):
        if name in os.environ:
            env[name] = os.environ[name]
    if args.compose_env:
        compose.extend(["--env-file", str(args.compose_env.absolute())])
    command(
        [*compose, "up", "-d", "--no-deps", "--force-recreate", "frontend"],
        label="Registry frontend recreation failed.", env=env, timeout=90,
    )


def status(context, route, method="GET", role=None, generation=None):
    headers = {}
    if role is not None:
        auth = role.encode() + b":" + generation[f"{role}-password"].rstrip(b"\n")
        headers["Authorization"] = "Basic " + base64.b64encode(auth).decode("ascii")
    connection = HTTPSConnection(REGISTRY, PORT, timeout=6, context=context)
    try:
        connection.request(method, route, headers=headers)
        return connection.getresponse().status
    finally:
        connection.close()


def probe(generation, rejected=None, *, wait=False):
    context = ssl.create_default_context(cafile=str(CLIENT_CA))
    for attempt in range(10 if wait else 1):
        try:
            anonymous = status(context, "/v2/")
        except OSError:
            anonymous = None
        if anonymous is not None:
            break
        if attempt < 9 and wait:
            time.sleep(1)
    if anonymous != 401:
        raise AccountError("Trusted TLS and anonymous access denial could not be verified.")
    cases = [
        ("reader", "/v2/", "GET", 200),
        ("writer", "/v2/", "GET", 200),
        ("reader", f"/v2/{REPOSITORY}/blobs/uploads/00000000-0000-0000-0000-000000000000", "PATCH", 401),
        ("reader", f"/v2/{REPOSITORY}/manifests/rehearsal-permission-check", "PUT", 401),
        ("reader", "/v2/_catalog", "GET", 404),
    ]
    for role, route, method, expected in cases:
        if generation[f"{role}-password"] is None:
            continue
        if status(context, route, method, role, generation) != expected:
            raise AccountError(f"Registry {role} {method} authorization check failed.")
    if rejected:
        for role in ROLES:
            if rejected[f"{role}-password"] is None:
                continue
            if status(context, "/v2/", role=role, generation=rejected) != 401:
                raise AccountError(f"The inactive {role} credential was not rejected.")


def check_known_set(previous, next_generation):
    # Compare each fixed path independently. An interruption during replacement
    # can leave a mix, which activation or rollback can repair from the stage.
    for name in FILES:
        current = read_auth_file(ROOT, name, allow_missing_writer=previous["writer-password"] is None)
        if current not in (previous[name], next_generation[name]):
            raise AccountError("Live authentication files do not match either staged generation.")


def switch_auth(args, *, restore=False):
    previous, next_generation = load_stage()
    secure_path(ROOT / "compose.yaml")
    if args.compose_env:
        secure_path(args.compose_env.absolute(), private=True)
    check_known_set(previous, next_generation)
    target, rejected = (previous, next_generation) if restore else (next_generation, previous)
    try:
        # An idempotent retry avoids frontend recreation after verification.
        if read_generation(ROOT, allow_missing_writer=True) == target:
            probe(target, rejected)
            print("Requested registry credential generation is already active.")
            return
    except (AccountError, OSError):
        pass
    try:
        write_generation(ROOT, target)
        frontend(args)
        probe(target, rejected, wait=True)
    except (AccountError, OSError, subprocess.SubprocessError):
        if not restore:
            try:
                write_generation(ROOT, previous)
                frontend(args)
                probe(previous, next_generation, wait=True)
            except (AccountError, OSError, subprocess.SubprocessError):
                raise AccountError("Registry activation and automatic rollback failed. The staged files can be used to retry rollback.") from None
            raise AccountError("Registry activation failed and the previous credentials were restored and verified.") from None
        raise AccountError("Registry credential rollback failed. The staged files were kept for recovery.") from None
    print("Registry credentials are active; the other generation was rejected.")


def finish_auth(*, discard=False):
    previous, next_generation = load_stage()
    expected, rejected = (previous, next_generation) if discard else (next_generation, previous)
    if read_generation(ROOT, allow_missing_writer=discard) != expected:
        raise AccountError("Expected registry credential generation is not installed.")
    probe(expected, rejected)
    shutil.rmtree(ROTATION)
    sync_directory(ROOT)
    print("Registry credential rotation staging was removed after verification.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compose-env", type=Path, help="root-only Compose env file with the pinned images")
    actions = parser.add_subparsers(dest="action", required=True)
    ssh = actions.add_parser("install-ssh")
    ssh.add_argument("--writer-public-key", type=Path, required=True)
    ssh.add_argument("--deploy-public-key", type=Path, required=True)
    ssh.add_argument("--deploy-entry", type=Path, required=True)
    for name in ("stage-auth", "activate-auth", "rollback-auth", "finalize-auth", "discard-auth", "check-auth"):
        actions.add_parser(name)
    args = parser.parse_args()

    if os.geteuid() != 0:
        raise AccountError("Run registry account administration as root.")
    os.umask(0o077)
    secure_path(ROOT, directory=True)
    secure_path(ROOT / "auth", directory=True)
    with (ROOT / ".account-management.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.action == "install-ssh":
            install_ssh(args)
        elif args.action == "stage-auth":
            stage_auth()
        elif args.action in ("activate-auth", "rollback-auth"):
            switch_auth(args, restore=args.action == "rollback-auth")
        elif args.action in ("finalize-auth", "discard-auth"):
            finish_auth(discard=args.action == "discard-auth")
        else:
            generation = read_generation(ROOT, allow_missing_writer=True)
            probe(generation)
            print("Registry TLS and available account authorizations verified.")


if __name__ == "__main__":
    try:
        main()
    except AccountError as error:
        sys.exit(str(error))
    except (OSError, ValueError, subprocess.SubprocessError):
        sys.exit("Registry account administration failed. No diagnostic contains credential values.")
