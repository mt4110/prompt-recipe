"""Convert the selected veil-rs RulePack rules without runtime TOML/network dependencies.
Usage: python3 scripts/import-advisory-rules.py /path/to/veil-rs
Retains the first definition for duplicate rule IDs, in source-file order.
"""
import json
import pathlib
import sys
import tomllib
root = pathlib.Path(sys.argv[1])
rules = {}
for name in ['cloud_keys', 'secrets', 'pii', 'pii_jp']:
    for rule in tomllib.loads((root / f'crates/veil/rules/default/{name}.toml').read_text()).get('rules', []):
        if any(part in rule['id'] for part in ['creds.', 'email', 'phone']):
            rules.setdefault(rule['id'], {'id': rule['id'], 'pattern': rule['pattern']})
pathlib.Path('content/advisory-rules.json').write_text(json.dumps(list(rules.values()), ensure_ascii=False, indent=2) + '\n')
pathlib.Path('content/VEIL-RULES-LICENSE-MIT').write_text((root / 'LICENSE-MIT').read_text())
