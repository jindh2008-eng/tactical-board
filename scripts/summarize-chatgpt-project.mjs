#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `
ChatGPT 데이터 내보내기에서 프로젝트 관련 대화를 선별해 계획문서용 요약 초안을 만듭니다.

사용법:
  npm run chatgpt:summary -- --input <conversations.json|압축해제폴더> --output <summary.md> [선택 조건]

선택 조건(최소 하나 필요):
  --project <이름>              프로젝트명 또는 프로젝트를 식별할 문구
  --keywords <a,b,c>           본문/제목 키워드. 쉼표로 구분
  --keyword <문구>             키워드 하나. 여러 번 사용 가능
  --ids <id1,id2>              대화 ID를 직접 지정
  --all                        모든 대화를 대상으로 함(개인정보 포함 가능)

추가 옵션:
  --from <YYYY-MM-DD>           이 날짜 이후 대화
  --to <YYYY-MM-DD>             이 날짜 이전 대화
  --match <any|all>             키워드 하나 이상/전부 일치. 기본값 any
  --max-conversations <n>       최대 대화 수. 기본값 50
  --max-items <n>               분류별 최대 후보 수. 기본값 12
  --excerpt-chars <n>           항목 하나의 최대 글자 수. 기본값 360
  --include-transcript          선별된 대화 원문도 출력(민감정보 주의)
  --list                        제목/ID/날짜/프로젝트 힌트만 표시하고 종료
  --help                        도움말 표시

예시:
  npm run chatgpt:summary -- \\
    --input "C:\\Downloads\\chatgpt-export" \\
    --project "전술상황판" \\
    --keywords "송수,구조대상자,체크리스트,배포" \\
    --output "C:\\Temp\\tactical-board-chatgpt-summary.md"

주의:
  - ChatGPT 내보내기 ZIP은 먼저 압축을 해제해야 합니다.
  - 결과는 언어모델 요약이 아니라 근거 문장을 선별한 '요약 초안'입니다.
  - 결과를 계획문서에 반영하기 전에 코드 확인과 사용자 승인이 필요합니다.
`;

const PROJECT_KEY_RE = /(project|workspace|folder|group).*(name|title|id)|^(project|workspace)$/i;
const DECISION_RE = /(결정|확정|채택|하기로|적용하기로|유지하기로|제외하기로|보류|폐기|완료 조건|decision|decided|approved|adopt)/i;
const ACTION_RE = /(필요|해야|권장|제안|추가|구현|수정|개선|검토|정리|오류|문제|위험|버그|향후|TODO|FIXME|should|recommend|need to|issue|bug|risk|plan)/i;
const REQUIREMENT_RE = /(원해|원한다|하고 싶|목표|요구|필요|기능|수정|개선|추가|만들|구현|검토|분석|want|require|need|goal|feature|build|fix|review)/i;
const QUESTION_RE = /(\?|？|미정|확인 필요|검증 필요|논의 필요|결정 필요|알 수 없|unknown|to be decided|open question)/i;

function parsePositiveInt(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option}에는 1 이상의 정수를 지정해야 합니다.`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = {
    keywords: [],
    ids: [],
    match: 'any',
    maxConversations: 50,
    maxItems: 12,
    excerptChars: 360,
    includeTranscript: false,
    all: false,
    list: false,
    help: false,
  };

  const takeValue = (index, option) => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${option} 값이 필요합니다.`);
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--include-transcript') options.includeTranscript = true;
    else if (arg === '--input') options.input = takeValue(i++, arg);
    else if (arg === '--output') options.output = takeValue(i++, arg);
    else if (arg === '--project') options.project = takeValue(i++, arg);
    else if (arg === '--from') options.from = takeValue(i++, arg);
    else if (arg === '--to') options.to = takeValue(i++, arg);
    else if (arg === '--match') options.match = takeValue(i++, arg).toLowerCase();
    else if (arg === '--keyword') options.keywords.push(takeValue(i++, arg));
    else if (arg === '--keywords') {
      options.keywords.push(...takeValue(i++, arg).split(',').map(value => value.trim()).filter(Boolean));
    } else if (arg === '--ids') {
      options.ids.push(...takeValue(i++, arg).split(',').map(value => value.trim()).filter(Boolean));
    } else if (arg === '--max-conversations') {
      options.maxConversations = parsePositiveInt(takeValue(i++, arg), arg);
    } else if (arg === '--max-items') {
      options.maxItems = parsePositiveInt(takeValue(i++, arg), arg);
    } else if (arg === '--excerpt-chars') {
      options.excerptChars = parsePositiveInt(takeValue(i++, arg), arg);
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }

  options.keywords = [...new Set(options.keywords)];
  options.ids = [...new Set(options.ids)];

  if (!['any', 'all'].includes(options.match)) {
    throw new Error('--match는 any 또는 all이어야 합니다.');
  }
  if (options.help) return options;
  if (!options.input) throw new Error('--input이 필요합니다.');
  if (!options.list && !options.output) throw new Error('--output이 필요합니다.');
  if (!options.list && !options.all && !options.project && options.keywords.length === 0 && options.ids.length === 0) {
    throw new Error('개인정보 보호를 위해 --project, --keywords, --ids 중 하나를 지정하거나 --all을 명시해야 합니다.');
  }
  return options;
}

async function resolveInputPath(inputPath) {
  const resolved = path.resolve(inputPath);
  const inputStat = await stat(resolved);
  if (inputStat.isDirectory()) return path.join(resolved, 'conversations.json');
  return resolved;
}

export async function loadConversations(inputPath) {
  const resolved = await resolveInputPath(inputPath);
  const raw = await readFile(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  const conversations = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.conversations)
      ? parsed.conversations
      : Array.isArray(parsed?.items)
        ? parsed.items
        : null;

  if (!conversations) {
    throw new Error('대화 배열을 찾을 수 없습니다. ChatGPT 내보내기의 conversations.json인지 확인하세요.');
  }
  return { conversations, resolved };
}

function flattenText(value, depth = 0) {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(item => flattenText(item, depth + 1)).filter(Boolean).join('\n');
  if (typeof value !== 'object') return '';
  if (typeof value.text === 'string') return value.text;
  if (typeof value.content === 'string') return value.content;
  if (Array.isArray(value.parts)) return flattenText(value.parts, depth + 1);
  return '';
}

function normalizeMessage(message, fallbackTime = 0) {
  if (!message || typeof message !== 'object') return null;
  const role = message.author?.role ?? message.role ?? 'unknown';
  const content = message.content?.parts ?? message.content ?? message.text ?? '';
  const text = flattenText(content).replace(/\r\n/g, '\n').trim();
  if (!text) return null;
  return {
    id: String(message.id ?? ''),
    role: String(role),
    text,
    time: Number(message.create_time ?? message.created_at ?? fallbackTime ?? 0),
  };
}

export function extractMessages(conversation) {
  if (Array.isArray(conversation?.messages)) {
    return conversation.messages
      .map(message => normalizeMessage(message, conversation.create_time))
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);
  }

  const mapping = conversation?.mapping;
  if (!mapping || typeof mapping !== 'object') return [];

  const orderedNodes = [];
  const currentNode = conversation.current_node;
  if (currentNode && mapping[currentNode]) {
    const visited = new Set();
    let nodeId = currentNode;
    while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      orderedNodes.unshift(mapping[nodeId]);
      nodeId = mapping[nodeId].parent;
    }
  } else {
    orderedNodes.push(...Object.values(mapping).sort((a, b) => {
      const aTime = Number(a?.message?.create_time ?? a?.create_time ?? 0);
      const bTime = Number(b?.message?.create_time ?? b?.create_time ?? 0);
      return aTime - bTime;
    }));
  }

  const seen = new Set();
  return orderedNodes
    .map(node => normalizeMessage(node?.message, node?.create_time ?? conversation.create_time))
    .filter(message => {
      if (!message) return false;
      const key = message.id || `${message.role}:${message.time}:${message.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function collectProjectHints(value, depth = 0, parentKey = '') {
  if (depth > 3 || value == null || typeof value !== 'object') return [];
  const hints = [];
  for (const [key, item] of Object.entries(value)) {
    if (PROJECT_KEY_RE.test(key) || PROJECT_KEY_RE.test(`${parentKey}.${key}`)) {
      if (typeof item === 'string' || typeof item === 'number') hints.push(String(item));
      else if (item && typeof item === 'object') {
        for (const candidate of ['name', 'title', 'id', 'slug']) {
          if (typeof item[candidate] === 'string') hints.push(item[candidate]);
        }
      }
    }
    if (item && typeof item === 'object' && !['mapping', 'messages'].includes(key)) {
      hints.push(...collectProjectHints(item, depth + 1, key));
    }
  }
  return [...new Set(hints.filter(Boolean))];
}

function normalizeForMatch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase();
}

function conversationDate(conversation) {
  const raw = Number(conversation.update_time ?? conversation.create_time ?? 0);
  if (!raw) return null;
  const millis = raw > 10_000_000_000 ? raw : raw * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBoundary(value, endOfDay = false) {
  if (!value) return null;
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}${suffix}` : value);
  if (Number.isNaN(date.getTime())) throw new Error(`잘못된 날짜: ${value}`);
  return date;
}

function analyzeConversation(conversation) {
  const messages = extractMessages(conversation);
  const title = String(conversation.title ?? conversation.name ?? '제목 없음');
  const id = String(conversation.id ?? conversation.conversation_id ?? conversation.uuid ?? 'unknown');
  const hints = collectProjectHints(conversation);
  const body = messages.map(message => message.text).join('\n');
  return { raw: conversation, id, title, hints, messages, body, date: conversationDate(conversation) };
}

export function selectConversations(conversations, options) {
  const project = normalizeForMatch(options.project);
  const keywords = options.keywords.map(normalizeForMatch);
  const idSet = new Set(options.ids);
  const from = parseBoundary(options.from);
  const to = parseBoundary(options.to, true);

  return conversations
    .map(analyzeConversation)
    .map(conversation => {
      const title = normalizeForMatch(conversation.title);
      const hints = normalizeForMatch(conversation.hints.join('\n'));
      const body = normalizeForMatch(conversation.body);
      const projectMatches = !project || title.includes(project) || hints.includes(project) || body.includes(project);
      const keywordMatches = keywords.map(keyword => title.includes(keyword) || body.includes(keyword));
      const keywordsMatch = keywords.length === 0
        || (options.match === 'all' ? keywordMatches.every(Boolean) : keywordMatches.some(Boolean));
      const idMatches = idSet.size === 0 || idSet.has(conversation.id);
      const afterFrom = !from || (conversation.date && conversation.date >= from);
      const beforeTo = !to || (conversation.date && conversation.date <= to);
      const score = (project && hints.includes(project) ? 50 : 0)
        + (project && title.includes(project) ? 25 : 0)
        + (project && body.includes(project) ? 5 : 0)
        + keywordMatches.reduce((total, matched, index) => total + (matched ? (title.includes(keywords[index]) ? 8 : 2) : 0), 0);
      const selectorMatches = options.all || (projectMatches && keywordsMatch && idMatches);
      return { ...conversation, score, selected: selectorMatches && afterFrom && beforeTo };
    })
    .filter(conversation => conversation.selected)
    .sort((a, b) => b.score - a.score || (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, options.maxConversations);
}

function truncate(text, maxChars) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function splitSentences(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n+|(?<=[.!?。！？])\s+/u)
    .map(sentence => sentence.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(sentence => sentence.length >= 8);
}

function dedupe(items, limit) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = normalizeForMatch(item.text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function classify(conversation, maxItems, excerptChars) {
  const candidates = conversation.messages.flatMap(message =>
    splitSentences(message.text).map(text => ({
      text: truncate(text, excerptChars),
      role: message.role,
    })),
  );
  const userCandidates = candidates.filter(item => item.role === 'user');
  return {
    requirements: dedupe([
      ...userCandidates.filter(item => REQUIREMENT_RE.test(item.text)),
      ...conversation.messages
        .filter(message => message.role === 'user')
        .map(message => ({ role: 'user', text: truncate(message.text, excerptChars) })),
    ], maxItems),
    decisions: dedupe(candidates.filter(item => DECISION_RE.test(item.text)), maxItems),
    actions: dedupe(candidates.filter(item => ACTION_RE.test(item.text) && !QUESTION_RE.test(item.text)), maxItems),
    questions: dedupe(candidates.filter(item => QUESTION_RE.test(item.text)), maxItems),
  };
}

function formatDate(date) {
  return date ? date.toISOString().slice(0, 10) : '날짜 없음';
}

function markdownList(items, emptyText = '없음') {
  return items.length > 0
    ? items.map(item => `- ${item.text}`).join('\n')
    : `- ${emptyText}`;
}

function escapeTable(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function buildMarkdown(selected, options, inputPath) {
  const sections = selected.map((conversation, index) => {
    const label = `C${index + 1}`;
    const classified = classify(conversation, options.maxItems, options.excerptChars);
    const transcript = options.includeTranscript
      ? `\n\n#### 원문\n\n${conversation.messages.map(message => `**${message.role}**\n\n${message.text}`).join('\n\n---\n\n')}`
      : '';
    return {
      label,
      conversation,
      classified,
      markdown: `### ${label}. ${conversation.title}\n\n- 대화 ID: \`${conversation.id}\`\n- 날짜: ${formatDate(conversation.date)}\n- 프로젝트 힌트: ${conversation.hints.length ? conversation.hints.map(escapeTable).join(', ') : '없음'}\n- 관련도 점수: ${conversation.score}\n\n#### 사용자 요구 후보\n\n${markdownList(classified.requirements)}\n\n#### 결정 후보\n\n${markdownList(classified.decisions)}\n\n#### 향후 작업 후보\n\n${markdownList(classified.actions)}\n\n#### 미해결 질문\n\n${markdownList(classified.questions)}${transcript}`,
    };
  });

  const aggregate = key => dedupe(
    sections.flatMap(section => section.classified[key].map(item => ({
      ...item,
      text: `${item.text} [${section.label}]`,
    }))),
    Math.max(options.maxItems, options.maxItems * 2),
  );

  const criteria = [
    options.project ? `프로젝트: ${options.project}` : null,
    options.keywords.length ? `키워드(${options.match}): ${options.keywords.join(', ')}` : null,
    options.ids.length ? `대화 ID: ${options.ids.join(', ')}` : null,
    options.from ? `시작일: ${options.from}` : null,
    options.to ? `종료일: ${options.to}` : null,
    options.all ? '범위: 전체 대화' : null,
  ].filter(Boolean).join(' / ');

  return `# ChatGPT 프로젝트 대화 요약 초안\n\n> 자동 생성된 근거 문장 선별 결과입니다. 확정된 요구사항이나 결정으로 간주하지 말고, 코드 확인과 프로젝트 책임자의 승인을 거쳐 계획문서에 반영하세요.\n\n- 생성 시각: ${new Date().toISOString()}\n- 입력 파일: \`${path.basename(inputPath)}\`\n- 선택 조건: ${criteria || '없음'}\n- 선별 대화 수: ${selected.length}\n- 원문 포함: ${options.includeTranscript ? '예' : '아니오'}\n\n## 출처 색인\n\n| 표기 | 날짜 | 제목 | 대화 ID |\n|---|---|---|---|\n${sections.map(({ label, conversation }) => `| ${label} | ${formatDate(conversation.date)} | ${escapeTable(conversation.title)} | \`${conversation.id}\` |`).join('\n')}\n\n## 통합 검토 후보\n\n### 사용자 요구\n\n${markdownList(aggregate('requirements'))}\n\n### 결정사항\n\n${markdownList(aggregate('decisions'))}\n\n### 향후 작업\n\n${markdownList(aggregate('actions'))}\n\n### 미해결 질문\n\n${markdownList(aggregate('questions'))}\n\n## 대화별 근거\n\n${sections.map(section => section.markdown).join('\n\n---\n\n')}\n\n## 계획문서 반영 체크\n\n- [ ] 현재 소스코드와 일치하는지 확인\n- [ ] 중복 제안 통합\n- [ ] 사용자 결정과 AI 제안 구분\n- [ ] 우선순위와 완료 조건 지정\n- [ ] 민감정보 및 다른 프로젝트 내용 제거\n`;
}

export function buildList(selected) {
  if (selected.length === 0) return '대화를 찾지 못했습니다.';
  return selected.map(conversation => [
    formatDate(conversation.date),
    conversation.id,
    conversation.title,
    conversation.hints.join(', ') || '-',
  ].join('\t')).join('\n');
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(HELP.trimStart());
    return { selected: [] };
  }

  const { conversations, resolved } = await loadConversations(options.input);
  const selectionOptions = options.list && !options.all && !options.project && options.keywords.length === 0 && options.ids.length === 0
    ? { ...options, all: true }
    : options;
  const selected = selectConversations(conversations, selectionOptions);

  if (options.list) {
    process.stdout.write(`${buildList(selected)}\n`);
    return { selected, resolved };
  }
  if (selected.length === 0) {
    throw new Error('조건에 맞는 대화를 찾지 못했습니다. --list로 제목과 프로젝트 힌트를 먼저 확인하세요.');
  }

  const output = path.resolve(options.output);
  if (output === path.resolve(resolved)) {
    throw new Error('원본 conversations.json을 출력 파일로 덮어쓸 수 없습니다. 다른 --output 경로를 지정하세요.');
  }
  const markdown = buildMarkdown(selected, options, resolved);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, markdown, 'utf8');
  process.stdout.write(`요약 초안 생성 완료: ${output}\n선별 대화 수: ${selected.length}\n`);
  return { selected, resolved, output, markdown };
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  run().catch(error => {
    process.stderr.write(`오류: ${error.message}\n\n${HELP}`);
    process.exitCode = 1;
  });
}
