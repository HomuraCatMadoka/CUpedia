#!/usr/bin/python3 -I
"""A fixed SSH standard-input bridge to the localhost TLS registry."""
import os
import socket
import sys
import threading

ADDRESS = ("127.0.0.1", 5105)


def send_input(registry):
    try:
        while data := os.read(0, 65536):
            registry.sendall(data)
        registry.shutdown(socket.SHUT_WR)
    except OSError:
        pass


def main():
    if os.environ.get("SSH_ORIGINAL_COMMAND") or len(sys.argv) != 1:
        sys.exit("This SSH identity supplies the registry connection only.")
    with socket.create_connection(ADDRESS, timeout=8) as registry:
        registry.settimeout(310)
        threading.Thread(target=send_input, args=(registry,), daemon=True).start()
        while data := registry.recv(65536):
            pending = memoryview(data)
            while pending:
                pending = pending[os.write(1, pending):]


if __name__ == "__main__":
    try:
        main()
    except OSError:
        sys.exit("Registry connection failed.")
