import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// Use Next's real Flight renderer: calling an async page directly cannot prove
// that its shell, header and list can arrive independently through Suspense.
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverReact = pathToFileURL(path.join(path.dirname(require.resolve("react/package.json")), "react.react-server.js")).href;
const serverJsx = pathToFileURL(path.join(path.dirname(require.resolve("react/package.json")), "jsx-runtime.react-server.js")).href;
const requests = new AsyncLocalStorage();
globalThis.__administrationStreamingFixture = requests;
const fixture = "globalThis.__administrationStreamingFixture.getStore()";
const stubs = {
  "next/link": "import {createElement} from 'react';export default function Link(props){return createElement('a',props)}",
  "@/lib/auth/session": `
    export async function requireAdministrator(){const state=${fixture};state.authCalls++;return await state.authorization.promise;}
    export async function ownAccessRequest(id){const state=${fixture};state.nameReads.push(id);return await state.name.promise;}`,
  "@/app/components/administrative-header": `import {createElement} from 'react';
    export function AdministrativeHeader(props){const state=${fixture};state.headers.push(props);
      return createElement('header',{'data-streaming-header':true,'data-user':props.userId},props.name);}`,
  "@/app/components/dialogo-logo": "import {createElement} from 'react';export function DialogoLogo(){return createElement('span',null,'Diálogo Engenharia')}",
  "@/app/components/access/AccessAdministration": `import {createElement} from 'react';
    export async function AccessAdministration(props){const state=${fixture};state.listReads.push(props);
      const result=await state.data.promise;
      return createElement('section',{'data-streaming-list':true},result);}`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react") return { url: serverReact, shortCircuit: true };
    if (specifier === "react/jsx-runtime") return { url: serverJsx, shortCircuit: true };
    // JSX runtime resolution from transpiled TSX must use the installed package.
    if (specifier.startsWith("react/") && context.parentURL?.startsWith("data:")) {
      return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    }
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    if (specifier.endsWith(".css")) return { url: "data:text/javascript,export default {}", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const base = path.join(root, "src", specifier.slice(2));
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
      assert.ok(resolved, `Missing aliased module: ${specifier}`);
      return nextResolve(pathToFileURL(resolved).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const React = await import("react");
const { renderToReadableStream } = await import("next/dist/compiled/react-server-dom-webpack/server.node.js");
const routes = await Promise.all([
  ["users", "", "Usuários e acessos", { pendentes: "2", historico: "3" }, { pendingPage: 2, historyPage: 3 }],
  ["pending", "/pendentes", "Aprovações pendentes", { pendentes: "4" }, { pendingOnly: true, pendingPage: 4 }],
  ["history", "/historico", "Aprovações e Histórico", { historico: "5" }, { historyOnly: true, historyPage: 5 }],
].map(async ([name, suffix, title, query, listProps]) => ({ name, title, query, listProps,
  Page: (await import(`../src/app/administracao/usuarios${suffix}/page.tsx`)).default,
  Loading: (await import(`../src/app/administracao/usuarios${suffix}/loading.tsx`)).default,
})));

function deferred() {
  let resolve, reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}
function makeFixture() {
  return {
    user: { id: "test-administrator-identity", email: "123@dialogo.com.br" },
    authorization: deferred(), name: deferred(), data: deferred(),
    authCalls: 0, nameReads: [], listReads: [], headers: [], errors: [],
    wire: "", complete: false,
  };
}
async function until(predicate, description) {
  // Await renderer work, not a wall-clock performance threshold. The gate under
  // test stays unresolved so the forbidden serialization cannot happen later.
  for (let turn = 0; turn < 100; turn++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(predicate(), description);
}
async function start(state, route, query = route.query, loadingOnly = false) {
  return requests.run(state, async () => {
    const node = loadingOnly ? React.createElement(route.Loading) : React.createElement(React.Suspense,
      { fallback: React.createElement(route.Loading) },
      React.createElement(route.Page, { searchParams: Promise.resolve(query) }));
    const stream = await renderToReadableStream(node, {}, {
      onError(error) { state.errors.push(error); return "administration-streaming-error"; },
    });
    const finished = (async () => {
      for await (const chunk of stream) state.wire += new TextDecoder().decode(chunk);
      state.complete = true;
    })();
    return { finished };
  });
}
async function finish(state, render) {
  // Also release gates after a failed assertion so no suspended test survives.
  state.authorization.resolve(state.user);
  state.name.resolve(null);
  state.data.resolve("released-fixture-data");
  await render.finished;
}

for (const route of routes) {
  test(`${route.name}: authorization gates identity and data; a slow name does not block the list`, async () => {
    const state = makeFixture();
    const render = await start(state, route);
    try {
      await until(() => state.authCalls === 1 && state.wire.includes("Carregando usuários e acessos"), "route loading streams while authorization waits");
      assert.deepEqual(state.nameReads, []);
      assert.deepEqual(state.listReads, []);
      assert.deepEqual(state.headers, []);
      assert.ok(!state.wire.includes(state.user.id));
      assert.ok(!state.wire.includes(state.user.email));

      state.authorization.resolve(state.user);
      await until(() => state.nameReads.length === 1 && state.listReads.length === 1 && state.wire.includes("Gestão de segurança e qualidade"),
        "both independent reads start before the name or data resolves");
      assert.deepEqual(state.nameReads, [state.user.id]);
      assert.deepEqual(state.listReads, [route.listProps]);
      assert.deepEqual(state.headers, [], "neutral header fallback has no interactive user controls");
      assert.equal(state.complete, false);

      const row = `resolved-${route.name}-list-before-name`;
      state.data.resolve(row);
      await until(() => state.wire.includes(row), "resolved list streams while display name is still pending");
      assert.equal(state.complete, false);
      assert.equal(state.headers.length, 0);
      assert.match(state.wire, /data-streaming-list/);

      state.name.resolve({ nome: "Nome confirmado do administrador" });
      await render.finished;
      assert.equal(state.headers.at(-1).name, "Nome confirmado do administrador");
      assert.deepEqual(state.errors, []);
    } finally { await finish(state, render); }
  });

  test(`${route.name}: rejected authorization never reads names or administrative data`, async () => {
    const state = makeFixture();
    const render = await start(state, route);
    try {
      await until(() => state.authCalls === 1, "page starts authorization");
      const denied = Object.assign(new Error("access-denied"), { destination: "/entrar" });
      state.authorization.reject(denied);
      await render.finished;
      assert.deepEqual(state.errors, [denied]);
      assert.deepEqual(state.nameReads, []);
      assert.deepEqual(state.listReads, []);
      assert.deepEqual(state.headers, []);
      assert.ok(!state.wire.includes(state.user.id));
      assert.ok(!state.wire.includes(state.user.email));
      assert.ok(!state.wire.includes("data-streaming-list"));
    } finally { await finish(state, render); }
  });
}

test("the named header streams while a slow list retains its own loading state", async () => {
  const state = makeFixture();
  state.authorization.resolve(state.user);
  const render = await start(state, routes[2]);
  try {
    await until(() => state.listReads.length === 1 && state.nameReads.length === 1, "both reads start");
    state.name.resolve({ nome: "Nome pronto antes da lista" });
    await until(() => state.wire.includes("Nome pronto antes da lista"), "header streams before the list");
    assert.equal(state.complete, false);
    assert.match(state.wire, /Carregando usuários e acessos/);
    assert.ok(!state.wire.includes("data-streaming-list"));
    assert.deepEqual(state.errors, []);
  } finally { await finish(state, render); }
});

test("email-derived names render without a name query on every administrative route", async () => {
  for (const route of routes) {
    const state = makeFixture();
    state.user.email = "maria.da.silva@dialogo.com.br";
    state.authorization.resolve(state.user);
    state.data.resolve("authorized-list-without-name-query");
    const render = await start(state, route);
    try {
      await until(() => state.complete, "page completes although the optional stored-name gate never resolves");
      await render.finished;
      assert.deepEqual(state.nameReads, []);
      assert.equal(state.headers.length, 1);
      assert.deepEqual(state.headers[0], { name: "Maria Silva", email: state.user.email, userId: state.user.id });
      assert.deepEqual(state.listReads, [route.listProps]);
      assert.deepEqual(state.errors, []);
    } finally { await finish(state, render); }
  }
});

test("missing or blank display names retain the authenticated email, or the generic user fallback", async () => {
  for (const [request, email, expected] of [
    [null, "123@dialogo.com.br", "123@dialogo.com.br"],
    [{ nome: "   " }, "123@dialogo.com.br", "123@dialogo.com.br"],
    [{ nome: 4 }, "123@dialogo.com.br", "123@dialogo.com.br"],
    [null, undefined, "Usuário"],
  ]) {
    const state = makeFixture();
    state.user.email = email;
    state.authorization.resolve(state.user);
    state.name.resolve(request);
    state.data.resolve("authorized-list");
    const render = await start(state, routes[0]);
    await render.finished;
    assert.ok(state.headers.length > 0);
    for (const header of state.headers) {
      assert.equal(header.name, expected);
      assert.equal(header.userId, state.user.id);
    }
    assert.deepEqual(state.errors, []);
  }
});

test("all administrative pages normalize invalid pagination before starting list reads", async () => {
  for (const route of routes) {
    for (const value of [undefined, "0", "-1", "1.5", "NaN", "1000000"]) {
      const state = makeFixture();
      state.authorization.resolve(state.user);
      state.name.resolve(null);
      state.data.resolve("normalized-page");
      const render = await start(state, route, { pendentes: value, historico: value });
      await render.finished;
      const expected = Object.fromEntries(Object.entries(route.listProps).map(([key, item]) => [key, typeof item === "number" ? 1 : item]));
      assert.deepEqual(state.listReads, [expected], `${route.name}: ${String(value)}`);
      assert.deepEqual(state.errors, []);
    }
  }
});

test("route loading UIs are accessible neutral shells and make no authenticated reads", async () => {
  for (const route of routes) {
    const state = makeFixture();
    const render = await start(state, route, {}, true);
    await render.finished;
    assert.equal(state.authCalls, 0);
    assert.deepEqual(state.nameReads, []);
    assert.deepEqual(state.listReads, []);
    assert.deepEqual(state.headers, []);
    assert.ok(state.wire.includes(route.title));
    assert.match(state.wire, /"aria-busy":(?:true|"true")/);
    assert.match(state.wire, /"role":"status"/);
    assert.match(state.wire, /"aria-live":"polite"/);
    assert.ok(!state.wire.includes(state.user.id));
    assert.ok(!state.wire.includes(state.user.email));
    assert.deepEqual(state.errors, []);
  }
});
