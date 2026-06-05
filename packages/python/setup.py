"""Setup file for making the wheel."""

from setuptools import find_packages, setup

setup(
    name="flexdataset",
    version="0.4.3",
    description="Python client for the Flexible Dataset Definition (FDD) validator.",
    license="Apache-2.0",
    author="Rodrigo Carvajal",
    url="https://github.com/ksco92/eevee",
    python_requires=">=3.14",
    packages=find_packages("src/"),
    package_dir={
        "": "src",
    },
    package_data={
        "flexdataset": [
            "_bin/*",
        ],
    },
    include_package_data=True,
    install_requires=[
        "typing_extensions>=4.0",
    ],
)
