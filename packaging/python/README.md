# vaerion — PyPI distribution

`pip install vaerion` installs the `vae` console launcher plus the packaged
engine source. Python is the delivery channel, not the substrate: the
launcher resolves the Bun runtime (ADR-0018) and `exec`s the engine's own
`main()` — identical exit codes and streaming behavior to every other
channel. A missing Bun runtime produces a taught error (E1600, exit 2)
with the exact install command for the detected OS, never a traceback.

```sh
pip install vaerion
vae --help
```

## Build the publishable wheel

```sh
sh packaging/python/make-package.sh
# -> dist/python/vaerion-<version>-py3-none-any.whl (+ sdist)
```

The wheel is an INPUT to publication (Founder-gated, risk-ledger F-5).
Offline verification without any registry:

```sh
python3 -m venv /tmp/vaerion-venv
/tmp/vaerion-venv/bin/pip install --no-deps dist/python/vaerion-<version>-py3-none-any.whl
/tmp/vaerion-venv/bin/vae --version
```
