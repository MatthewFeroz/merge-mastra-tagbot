// Checks the connector catalog parser and matching against a small fixture. No network.
//   npx tsx scripts/catalog-test.ts
import assert from 'node:assert/strict';
import { findConnectors, parseCatalog } from '../src/mastra/connector-catalog';

const markdown = `
[![GitHub](https://img/github.png)GitHub ](/merge-agent-handler/connectors/git-hub)
[![Notion](https://img/notion.png)Notion ](/merge-agent-handler/connectors/notion)
[![X](https://img/x.png)X ](/merge-agent-handler/connectors/x)
[![Google Drive](https://img/drive.png)Google Drive ](/merge-agent-handler/connectors/google-drive)
[![Airbyte](https://img/airbyte.png)Airbyte ](/merge-agent-handler/connectors/generic/airbyte)
[![Notion](https://img/notion.png)Notion ](/merge-agent-handler/connectors/notion)
`;
const connectors = parseCatalog(markdown);
assert.equal(connectors.length, 5, 'duplicates collapse to one entry');
assert.deepEqual(connectors[1], { name: 'Notion', url: 'https://docs.merge.dev/merge-agent-handler/connectors/notion' });

assert.equal(findConnectors(connectors, 'notion').supported, true);
assert.equal(findConnectors(connectors, 'Git Hub').supported, true);
assert.equal(findConnectors(connectors, 'Airbyte').matches[0].url.endsWith('/generic/airbyte'), true);
const excalidraw = findConnectors(connectors, 'Excalidraw');
assert.equal(excalidraw.supported, false);
assert.deepEqual(excalidraw.matches, [], 'a one-letter name like X must not match');
assert.equal(findConnectors(connectors, 'google').matches[0].name, 'Google Drive');
assert.equal(findConnectors(connectors, '').supported, false);
console.log('Catalog passed: parsing, dedupe, exact and partial matches, no one-letter false positives.');
