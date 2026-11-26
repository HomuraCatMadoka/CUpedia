#!/usr/bin/python3 -I
"""Pull a pinned rehearsal image using the server-local reader credential."""
import base64
import fcntl
import os
from pathlib import Path
import re
import ssl
import subprocess
import sys
import tempfile
from urllib.error import HTTPError
from urllib.request import Request,urlopen

ROOT = Path("/srv/cupedia-private-registry-rehearsal-20261126")
ADDRESS="127.0.0.1:5105"
REPOSITORY="cupedia-rehearsal"
IMAGE=f"{ADDRESS}/{REPOSITORY}"
DOCKER="/usr/bin/docker"

def result(context,path,method,auth=None):
    request=Request("https://"+ADDRESS+path,method=method)
    if auth:
        request.add_header("Authorization","Basic "+base64.b64encode(auth).decode("ascii"))
    try:
        with urlopen(request,context=context,timeout=12) as response:
            return response.status
    except HTTPError as failure:
        return failure.code

def proof(context,digest,password):
    auth=b"reader:"+password
    if result(context,f"/v2/{REPOSITORY}/manifests/{digest}","HEAD")!=401:
        raise RuntimeError("anonymous manifest access was not denied")
    if result(context,"/v2/","GET",auth)!=200:
        raise RuntimeError("reader authentication probe failed")
    if result(context,f"/v2/{REPOSITORY}/blobs/uploads/","POST",auth) not in (401,403):
        raise RuntimeError("read-only credential was not denied an upload")
    print("Anonymous access denied; reader authenticated and write rejected.",flush=True)

def main():
    os.umask(0o077)
    message=sys.stdin.buffer.read(257)
    if message == b"CUPEDIA-PRIVATE-PROBE\n":
        print("Restricted Seoul private deploy entry ready")
        return 0
    if len(message)>256:
        raise RuntimeError("rehearsal request too large")
    try:
        version,digest,revision=message.decode("ascii").splitlines()
    except ValueError:
        raise RuntimeError("invalid rehearsal request format") from None
    if (version!="CUPEDIA-PRIVATE-REHEARSAL-1" or not re.fullmatch(r"sha256:[0-9a-f]{64}",digest)
        or not re.fullmatch(r"[a-f0-9]{40}",revision)):
        raise RuntimeError("invalid rehearsal request values")
    candidate=f"{IMAGE}@{digest}"
    baseline=(ROOT/"baseline").read_text().strip()
    if not re.fullmatch(r"sha256:[0-9a-f]{64}",baseline):
        raise RuntimeError("invalid rehearsal baseline")
    context=ssl.create_default_context(cafile=f"/etc/docker/certs.d/{ADDRESS}/ca.crt")
    password=(ROOT/"reader-password").read_bytes().strip()
    if not re.fullmatch(rb"[!-~]{20,250}",password):
        raise RuntimeError("missing or invalid server reader credential")
    with (ROOT/"deploy.lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        proof(context,digest,password)
        with tempfile.TemporaryDirectory(prefix="cupedia-private-pull-") as config:
            docker=[DOCKER,"--config",config]
            login=subprocess.run([*docker,"login",ADDRESS,"--username","reader","--password-stdin"],
                                 input=password,capture_output=True,timeout=20)
            if login.returncode:
                raise RuntimeError("Docker reader login failed")
            pull=subprocess.run([*docker,"pull","--platform","linux/amd64",candidate],
                                capture_output=True,timeout=150)
            if pull.returncode:
                raise RuntimeError("Docker read-only pull by digest failed")
        actual=subprocess.check_output(
            [DOCKER,"image","inspect","--format",'{{index .Config.Labels "org.opencontainers.image.revision"}}',candidate],
            text=True,timeout=12).strip()
        if actual!=revision:
            raise RuntimeError("candidate revision did not match the workflow commit")
        print(f"Read-only Docker pull and source revision matched {digest}.",flush=True)
        return subprocess.run(["/bin/bash",str(ROOT/"rehearse-rollout.sh"),baseline,candidate],timeout=320).returncode

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error) if type(error)==RuntimeError else "Seoul private rehearsal command failed.",file=sys.stderr)
        raise SystemExit(1)
