#!/usr/bin/env node

// SPDX-FileCopyrightText: 2021 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: GPL-2.0-only

const fs = require('fs');
const path = require('path');
const remark = require('remark');
const remarkBehead = require('remark-behead');
const remarkGap = require('remark-heading-gap');
const remarkSlug = require('remark-slug');
const html = require('remark-html');
const mermaid = require('remark-mermaid');
const remarkTOC = require('remark-toc');
const vfile = require('to-vfile');
const selectAll = require('unist-util-select').selectAll;
const wrap = require('./wrap');

const indexOfStuffem = process.argv.findIndex((x) => x.includes('stuffem'));
const inputFileName = process.argv.slice(indexOfStuffem + 1)[0];

function noop() {}

function collectFiles(list) {
  return () => (tree) => {
    for (const link of selectAll('listItem link', tree)) {
      list.push(link.url);
    }
  };
}

async function* concatenate(...args) {
  const asyncIters =
    args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  for (const asyncIter of asyncIters) {
    for await (const x of asyncIter) {
      yield x;
    }
  }
}

async function* of(x) {
  yield x;
}

async function toString(asyncIter) {
  let result = '';
  for await (const x of asyncIter) result += x;
  return result;
}

const INPUT_PATH = path.join(process.cwd(), inputFileName || 'README.md');
const OUTPUT_PATH = process.cwd();
const TOC = 'Table of contents';

async function main() {
  const listFiles = [];
  await remark()
    .use(collectFiles(listFiles))
    .process(vfile.readSync(INPUT_PATH));

  const contentsPerFile = listFiles.map((filename) => {
    const filepath = path
      .join(INPUT_PATH, '..', filename)
      .replace(/\%20/g, ' ');
    const asyncIter = fs.createReadStream(filepath, {encoding: 'utf-8'});
    return concatenate(asyncIter, of('\n'));
  });
  const fullContents = await toString(concatenate(contentsPerFile));
  const hasTOC = fullContents.includes(`# ${TOC}`);

  const headerSpacing = {before: 2, after: 1};

  const output = await remark()
    .use(hasTOC ? remarkBehead : noop, {after: TOC, depth: 1})
    .use(remarkGap, {1: headerSpacing, 2: headerSpacing, 3: headerSpacing})
    .use(remarkSlug)
    .use(mermaid, {simple: true})
    .use(hasTOC ? remarkTOC : noop, {heading: TOC, maxDepth: 3, tight: true})
    .use(html)
    .process(fullContents);

  const revision = new Date().toISOString().slice(0, 10);
  const fixRelativeLinks = (match, _, slugMatch) => {
    return `href="#${slugMatch.replace(/%20/g, '-').toLowerCase()}"`;
  };

  const everything = String(output)
    .replace(/\#TODO/g, '')
    .replace(/href="([.]{2}[/].*?[/])?(\S*?)\.md"/g, fixRelativeLinks)
    .replace('$REVISION', revision);

  fs.writeFileSync(path.join(OUTPUT_PATH, 'index.html'), wrap(everything));
}

main();
