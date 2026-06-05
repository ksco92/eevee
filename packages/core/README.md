# flexdataset

The reference validator and CLI for the **Flexible Dataset Definition (FDD)** standard — a JSON format
for describing datasets (tables) as files, validated structurally (JSON Schema) and semantically
(cross-field and cross-file rules). See the [project repository](https://github.com/ksco92/eevee).

## Install

```bash
npm install -g flexdataset
```

Or download a standalone binary (no Node required) from
[Releases](https://github.com/ksco92/eevee/releases).

## Use

```bash
flexdataset validate <root>                 # structural + semantic checks
flexdataset validate <root> --format json   # machine-readable violations
flexdataset graph <root> --out dag.svg      # dependency DAG
flexdataset er <root> --out er.svg          # entity-relationship diagram
```

`validate` exits non-zero when there are error-level violations. The `graph` and `er` commands render
SVG via WASM Graphviz (no system Graphviz needed).

## License

Apache-2.0. See [LICENSE](LICENSE).
