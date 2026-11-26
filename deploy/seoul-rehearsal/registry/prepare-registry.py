from pathlib import Path
import base64
import bcrypt
import os
import secrets
import subprocess

os.umask(0o077)
auth=Path("auth")
tls=Path("tls")
auth.mkdir(mode=0o700)
tls.mkdir(mode=0o700)
users = {name: secrets.token_urlsafe(36).encode() for name in ("reader","writer","backend")}
hashes={name: name.encode()+b":"+bcrypt.hashpw(secret,bcrypt.gensalt(rounds=10))+b"\n"
        for name,secret in users.items()}
(auth/"reader.htpasswd").write_bytes(hashes["reader"]+hashes["writer"])
(auth/"writer.htpasswd").write_bytes(hashes["writer"])
(auth/"backend.htpasswd").write_bytes(hashes["backend"])
for name in ("reader.htpasswd","writer.htpasswd"):
    (auth/name).chmod(0o444)
header=base64.b64encode(b"backend:"+users["backend"]).decode()
(auth/"backend-authorization.conf").write_text(f'proxy_set_header Authorization "Basic {header}";\n')
for name in ("reader","writer"):
    Path(f"{name}-password").write_bytes(users[name]+b"\n")

def ssl(*args):
    subprocess.run(["/usr/bin/openssl",*args],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

ssl("req","-x509","-newkey","rsa:2048","-sha256","-nodes","-days","7",
    "-subj","/CN=CUpedia rehearsal registry CA",
    "-addext","basicConstraints=critical,CA:TRUE,pathlen:0",
    "-addext","keyUsage=critical,keyCertSign,cRLSign",
    "-keyout","tls/ca.key","-out","tls/ca.crt")
ssl("req","-newkey","rsa:2048","-sha256","-nodes","-subj","/CN=CUpedia rehearsal registry",
    "-keyout","tls/server.key","-out","tls/server.csr")
(tls/"server.ext").write_text("subjectAltName=IP:127.0.0.1\n"
    "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n")
ssl("x509","-req","-in","tls/server.csr","-CA","tls/ca.crt","-CAkey","tls/ca.key","-CAcreateserial",
    "-out","tls/server.crt","-days","7","-sha256","-extfile","tls/server.ext")
for name in ("ca.key","ca.srl","server.csr","server.ext"):
    (tls/name).unlink()
(tls/"server.crt").chmod(0o444)
(tls/"ca.crt").chmod(0o444)
