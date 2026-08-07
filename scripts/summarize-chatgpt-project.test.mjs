import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildMarkdown,
  extractMessages,
  loadConversations,
  parseArgs,
  run,
  selectConversations,
} from './summarize-chatgpt-project.mjs';

function sampleConversation({ id, title, project, userText, assistantText, time }) {
  return {
    id,
    title,
    project: { name: project },
    create_time: time,
    update_time: time,
    current_node: `${id}-assistant`,
    mapping: {
      [`${id}-root`]: {
        id: `${id}-root`,
        parent: null,
        message: null,
      },
      [`${id}-user`]: {
        id: `${id}-user`,
        parent: `${id}-root`,
        message: {
          id: `${id}-user-message`,
          author: { role: 'user' },
          create_time: time,
          content: { parts: [userText] },
        },
      },
      [`${id}-assistant`]: {
        id: `${id}-assistant`,
        parent: `${id}-user`,
        message: {
          id: `${id}-assistant-message`,
          author: { role: 'assistant' },
          create_time: time + 1,
          content: { parts: [assistantText] },
        },
      },
    },
  };
}

const tactical = sampleConversation({
  id: 'conv-tactical',
  title: '전술상황판 송수 검토',
  project: '전술상황판',
  userText: '급수 연결이 끊기면 방수를 중단하도록 수정하고 싶어.',
  assistantText: '마지막 급수 연결 제거 시 방수 상태도 해제하는 방식을 권장합니다. 완료 조건을 테스트해야 합니다.',
  time: 1_750_000_000,
});

const unrelated = sampleConversation({
  id: 'conv-other',
  title: '여행 일정',
  project: '개인 여행',
  userText: '서울 여행 일정을 만들어줘.',
  assistantText: '이틀 일정을 제안합니다.',
  time: 1_751_000_000,
});

test('current_node 부모 체인 순서로 대화를 복원한다', () => {
  const messages = extractMessages(tactical);
  assert.deepEqual(messages.map(message => message.role), ['user', 'assistant']);
  assert.match(messages[0].text, /급수 연결/);
});

test('프로젝트명과 키워드로 관련 대화만 선별한다', () => {
  const selected = selectConversations([tactical, unrelated], {
    project: '전술상황판',
    keywords: ['방수'],
    ids: [],
    match: 'any',
    maxConversations: 50,
    all: false,
  });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 'conv-tactical');
});

test('--all을 사용해도 날짜 범위는 적용한다', () => {
  const selected = selectConversations([tactical, unrelated], {
    project: undefined,
    keywords: [],
    ids: [],
    match: 'any',
    from: '2025-06-20',
    to: undefined,
    maxConversations: 50,
    all: true,
  });
  assert.deepEqual(selected.map(conversation => conversation.id), ['conv-other']);
});

test('요약 Markdown에 출처와 검토 후보를 기록한다', () => {
  const selected = selectConversations([tactical], {
    project: '전술상황판',
    keywords: [],
    ids: [],
    match: 'any',
    maxConversations: 50,
    all: false,
  });
  const markdown = buildMarkdown(selected, {
    project: '전술상황판',
    keywords: [],
    ids: [],
    match: 'any',
    maxItems: 12,
    excerptChars: 360,
    includeTranscript: false,
    all: false,
  }, 'conversations.json');
  assert.match(markdown, /conv-tactical/);
  assert.match(markdown, /급수 연결/);
  assert.match(markdown, /계획문서 반영 체크/);
  assert.doesNotMatch(markdown, /서울 여행/);
});

test('폴더 입력에서 conversations.json을 읽고 CLI 인자를 검증한다', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chatgpt-summary-test-'));
  try {
    await writeFile(path.join(tempDir, 'conversations.json'), JSON.stringify([tactical]), 'utf8');
    const loaded = await loadConversations(tempDir);
    assert.equal(loaded.conversations.length, 1);

    const output = path.join(tempDir, 'nested', 'summary.md');
    const options = parseArgs([
      '--input', tempDir,
      '--output', output,
      '--project', '전술상황판',
    ]);
    assert.equal(options.project, '전술상황판');

    await run([
      '--input', tempDir,
      '--output', output,
      '--project', '전술상황판',
    ]);
    assert.match(await readFile(output, 'utf8'), /전술상황판 송수 검토/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
