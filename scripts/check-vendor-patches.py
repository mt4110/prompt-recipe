"""Verify the reviewed local security patches; cargo-audit skips path crates."""
import hashlib
import json
import io
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tomllib
import urllib.request

root = Path(__file__).resolve().parents[1]
vendor = root / "src-tauri/vendor"
for crate in json.loads((vendor / "PATCHES.json").read_text()):
    if "--upstream" in sys.argv:
        url = f"https://static.crates.io/crates/{crate['name']}/{crate['name']}-{crate['version']}.crate"
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != crate["registry_checksum"]:
            raise SystemExit(f"Registry archive checksum mismatch: {crate['name']}")
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            for name, digest in crate["original_files"].items():
                member = archive.extractfile(f"{crate['name']}-{crate['version']}/{name}")
                if member is None or hashlib.sha256(member.read()).hexdigest() != digest:
                    raise SystemExit(f"Original source mismatch: {crate['name']}/{name}")
    expected = crate["original_files"] | crate["patched_files"]
    actual = {
        str(p.relative_to(vendor / crate["name"])): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in (vendor / crate["name"]).rglob("*") if p.is_file()
    }
    if actual != expected:
        raise SystemExit(f"Unreviewed vendor change: {crate['name']}")
    print(f"Verified {crate['name']} {crate['version']}: {len(actual)} files")

source = (vendor / "glib/src/variant_iter.rs").read_text()
if "let mut p: *mut libc::c_char" not in source or "&mut p," not in source:
    raise SystemExit("GLib mutable out-pointer repair is missing")
for name in ["glib-macros", "gtk3-macros"]:
    manifest = tomllib.loads((vendor / name / "Cargo.toml").read_text())
    dependency = manifest["dependencies"].get("proc-macro-error3", {})
    if dependency != {"version": "=3.1.1", "default-features": False, "features": ["syn2-error"]}:
        raise SystemExit(f"Maintained syn2-compatible macro dependency missing in {name}")
lock = tomllib.loads((root / "src-tauri/Cargo.lock").read_text())
for package in lock["package"]:
    if package["name"] in ["proc-macro-error", "proc-macro-error2", "basic-toml"]:
        raise SystemExit(f"Retired dependency remains: {package['name']}")
    if package["name"] in ["glib", "glib-macros", "gtk3-macros"] and "source" in package:
        raise SystemExit(f"Local security patch bypassed: {package['name']}")
print("Security patch and lockfile checks passed")

if "--audit-upstream" in sys.argv:
    # Audit path crates by registry identity too, so future advisories cannot
    # disappear merely because Cargo's patch section changes their source.
    checksums = {
        c["name"]: c["registry_checksum"]
        for c in json.loads((vendor / "PATCHES.json").read_text())
    }
    text = (root / "src-tauri/Cargo.lock").read_text()
    for name, checksum in checksums.items():
        pattern = rf'(\[\[package\]\]\nname = "{re.escape(name)}"\nversion = "[^"]+"\n)'
        text, count = re.subn(pattern, lambda m: m[1] +
            f'source = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "{checksum}"\n', text)
        if count != 1:
            raise SystemExit(f"Expected exactly one patched package: {name}")
    result = subprocess.run(
        [os.environ.get("CARGO_AUDIT", "cargo-audit"), "audit", "--file", "-", "--json", "--no-fetch"],
        input=text, text=True, capture_output=True, check=False,
    )
    if result.returncode not in [0, 1]:
        raise SystemExit(result.stderr)
    report = json.loads(result.stdout)
    findings = report["vulnerabilities"]["list"] + [
        item for group in report["warnings"].values() for item in group
    ]
    for item in findings:
        key = (item.get("advisory", {}).get("id"), item["package"]["name"], item["package"]["version"])
        if key != ("RUSTSEC-2024-0429", "glib", "0.18.5"):
            raise SystemExit(f"Unresolved upstream advisory: {key}")
        print(f"{key[0]}: resolved by the verified local out-pointer repair")
    print("Upstream identity audit passed; no other advisories found")
