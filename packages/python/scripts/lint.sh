#!/bin/sh

set -ex

python3 -m black ./src/ ./tests/
python3 -B -m isort ./src/ ./tests/
python3 -m flake8 --config=setup.cfg ./
