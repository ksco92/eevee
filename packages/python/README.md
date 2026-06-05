# fdd (Python)

Python client for the [Flexible Dataset Definition (FDD)](https://github.com/ksco92/eevee) validator.
It shells out to the `fdd` CLI and returns typed results.

## Install

```bash
pip install fdd
```

Platform wheels bundle the `fdd` binary, so nothing else is needed. On a platform without a wheel,
install the source distribution and point `FDD_BINARY` at the CLI — a downloaded standalone binary, or
`node /path/to/dist/src/cli.js`.

## Use

```python
import fdd

result = fdd.validate("path/to/root")
print(result.ok, len(result.errors), len(result.warnings))
for violation in result.errors:
    print(violation.code, violation.schema, violation.table, violation.message)

dag_svg = fdd.graph("path/to/root")   # dependency DAG
er_svg = fdd.er("path/to/root")       # entity-relationship diagram
```

Or use the client directly:

```python
from fdd import FddClient

client = FddClient()                                  # resolves FDD_BINARY / the bundled binary
explicit = FddClient(command=["node", "dist/src/cli.js"])
```

## Binary resolution

`FddClient` resolves the CLI in this order: the `FDD_BINARY` environment variable (split with shell
rules, so `"node /path/to/cli.js"` works), then the platform binary bundled in the installed wheel. If
neither is found, `FddBinaryNotFoundError` is raised.

## Development

```bash
python3.14 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
pip install -e .
sh scripts/lint.sh    # black, isort, flake8
sh scripts/test.sh    # pytest, 95% coverage gate
```
