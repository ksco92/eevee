/**
 * Thin wrapper over the WASM Graphviz engine. Kept separate from the DOT
 * builders so the (pure, deterministic) DOT generation can be unit-tested
 * without loading WASM.
 */

/**
 * Render a Graphviz DOT document to SVG.
 *
 * `@hpcc-js/wasm-graphviz` is ESM-only, so it is pulled in via a dynamic import
 * (preserved by the NodeNext target and resolvable from this CommonJS module at
 * runtime) rather than a static import.
 *
 * @param dot A DOT document.
 * @returns The rendered SVG markup.
 */
export async function renderDot(dot: string): Promise<string> {
    const {
        Graphviz, 
    } = await import('@hpcc-js/wasm-graphviz');
    const graphviz = await Graphviz.load();
    return graphviz.dot(dot);
}
