#!/bin/sh

set -ex

python3 -m pytest tests/ --cov=src/fdd --cov-fail-under=95
