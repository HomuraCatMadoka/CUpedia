#!/usr/bin/python3 -I
"""Accept one immutable rehearsal image and a short-lived read-only GHCR credential."""
import fcntl
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path("/srv/cupedia-seoul-rehearsal-20261126")
IMAGE = "ghcr.io/homuracatmadoka/cupedia-seoul-rehearsal-20261126"
DOCKER = "/usr/bin/docker"
DIGEST = r"sha256:[0-9a-f]{64}"

def run():
    os.umask(0o077)
    message = sys.stdin.buffer.read(800)
    if message == b"CUPEDIA-REHEARSAL-PROBE\n":
        print("Restricted Seoul rehearsal endpoint ready")
        return 0
    try:
        version, actor, digest, password = message.decode("ascii").splitlines()
    except ValueError:
        raise RuntimeError("bad handoff format") from None
    if (version != "CUPEDIA-REHEARSAL-1" or not re.fullmatch(r"[A-Za-z0-9-]{1,39}",actor)
        or not re.fullmatch(DIGEST,digest) or not re.fullmatch(r"[A-Za-z0-9_]{20,250}",password)):
        raise RuntimeError("bad handoff values")
    if not re.fullmatch(DIGEST,baseline := (ROOT/"baseline").read_text().strip()):
        raise RuntimeError("bad baseline image")
    candidate = IMAGE+"@"+digest
    with (ROOT/"rehearsal.lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        with tempfile.TemporaryDirectory(prefix="cupedia-rehearsal-docker-") as config:
            docker = [DOCKER,"--config",config]
            anonymous = subprocess.run([*docker,"manifest","inspect",candidate],capture_output=True,timeout=18)
            if anonymous.returncode == 0 or not re.search(rb"denied|unauthorized|authentication required",anonymous.stderr,re.I):
                raise RuntimeError("could not verify anonymous access was denied")
            print("Anonymous image access denied.",flush=True)
            login = subprocess.run(
                [*docker,"login","ghcr.io","--username",actor,"--password-stdin"],
                input=password.encode("ascii"),capture_output=True,timeout=18,
            )
            if login.returncode:
                raise RuntimeError("temporary registry authentication failed")
            pull = subprocess.run([*docker,"pull","--platform","linux/amd64",candidate],
                                  capture_output=True,timeout=190)
            if pull.returncode:
                raise RuntimeError("pinned registry image pull failed")
        print("Authenticated pull from GHCR by digest passed.",flush=True)
        return subprocess.run(["/bin/bash",str(ROOT/"rehearse-rollout.sh"),baseline,candidate],
                              timeout=330).returncode

try:
    raise SystemExit(run())
except (OSError, RuntimeError, subprocess.SubprocessError) as failure:
    detail = str(failure) if type(failure) is RuntimeError else "operation failed or timed out"
    print("Seoul deployment rehearsal: "+detail,file=sys.stderr)
    raise SystemExit(1)
