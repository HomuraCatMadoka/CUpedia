import base64
from pathlib import Path
import ssl
import subprocess
import tempfile
import time
from urllib.error import HTTPError,URLError
from urllib.request import Request,urlopen

root=Path(".")
context=ssl.create_default_context(cafile=str(root/"tls/ca.crt"))
def check(role,path,method="GET"):
    headers={}
    if role:
        secret=(root/f"{role}-password").read_bytes().strip()
        headers={"Authorization":"Basic "+base64.b64encode(role.encode()+b":"+secret).decode()}
    request=Request("https://127.0.0.1:5105"+path,headers=headers,method=method)
    try:
        with urlopen(request,context=context,timeout=5) as response:
            return response.status
    except HTTPError as error:
        return error.code

for attempt in range(10):
    try:
        if check("","/v2/")==401:
            break
    except (OSError,URLError):
        pass
    time.sleep(1)
else:
    raise SystemExit("Private registry was not reachable with the trusted certificate")
checks=[
    ("","/v2/","GET",401),
    ("reader","/v2/","GET",200),
    ("writer","/v2/","GET",200),
    ("reader","/v2/cupedia-rehearsal/blobs/uploads/","POST",401),
    ("reader","/v2/cupedia-rehearsal/manifests/rehearsal-permission-check","PUT",401),
    ("writer","/v2/_catalog","GET",404),
]
for role,path,method,expected in checks:
    actual=check(role,path,method)
    if actual!=expected:
        raise SystemExit(f"Registry ACL check returned {actual}, expected {expected} for {role or 'anonymous'} {method}")
print("Registry TLS and method authorizations passed (6 probes).")
with tempfile.TemporaryDirectory(prefix="cupedia-registry-credential-check-") as temp:
    for role in ("reader","writer"):
        passwd=(root/f"{role}-password").read_bytes().strip()
        login=subprocess.run(["/usr/bin/docker","--config",temp,"login","127.0.0.1:5105",
            "--username",role,"--password-stdin"],input=passwd,capture_output=True,timeout=15)
        if login.returncode:
            marker=": "+login.stderr.decode().splitlines()[-1].split(":")[-1] if login.stderr else ""
            raise SystemExit(f"Docker {role} authentication failed"+marker)
print("Docker used the scoped CA and authenticated both independent accounts.")
