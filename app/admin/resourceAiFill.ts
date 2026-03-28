import Constants from 'expo-constants';
import { RESOURCE_CATEGORIES, RESOURCE_CATEGORY_LABELS } from '@/app/therapist/_marketplace';

function getOpenAiKey(): string | null {
  const extra = Constants.expoConfig?.extra as { openaiApiKey?: string } | undefined;
  const k = extra?.openaiApiKey ?? (Constants as { manifest?: { extra?: { openaiApiKey?: string } } }).manifest?.extra?.openaiApiKey;
  return typeof k === 'string' && k.trim() ? k.trim() : null;
}

export function isResourceAiConfigured(): boolean {
  return getOpenAiKey() != null;
}

/** Short library description from title (book or article). */
export async function suggestResourceDescription(
  title: string,
  kind: 'book' | 'article'
): Promise<string | null> {
  const apiKey = getOpenAiKey();
  if (!apiKey || !title.trim()) return null;
  const kindLabel = kind === 'article' ? 'academic article or paper' : 'book';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You write blunt, spoiler-style blurbs for a therapist resource library—given only a ${kindLabel} title, infer what it likely covers and say it straight, like you're telling a colleague what they're actually in for (topics, arguments, frameworks, what kind of cases or ideas show up). 2–3 short sentences max.

Rules:
- Sound human and direct. No publisher / Amazon back-cover voice.
- Never start with "This book" / "This work" / "X explores" / "X delves into" / "provides insights" / "emphasizes the significance" / "valuable for therapists seeking to" / "enhance clinical practice" / "deepen their understanding"—or any similar filler.
- No stacked abstract nouns ("complex dynamics of relational processes"). Say concrete stuff instead.
- No bullet points. No quotation marks around the title.`,
        },
        { role: 'user', content: `Title: ${title.trim()}` },
      ],
      max_tokens: 180,
      temperature: 0.65,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

/** Primary author name(s) from a well-known title, or null if unknown. */
export async function suggestResourceAuthor(
  title: string,
  kind: 'book' | 'article'
): Promise<string | null> {
  const apiKey = getOpenAiKey();
  if (!apiKey || !title.trim()) return null;
  const kindLabel = kind === 'article' ? 'article or paper' : 'book';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You respond with ONLY the author or authors' names for a published ${kindLabel} in psychology, psychotherapy, counselling, or mental health—comma-separated if several (e.g. "Jane Smith, John Doe"). No titles (Dr., Prof.), no extra words, no quotes. If you cannot identify a likely author from the title alone, respond with exactly: Unknown`,
        },
        { role: 'user', content: `Title: ${title.trim()}` },
      ],
      max_tokens: 60,
      temperature: 0.2,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  let text = data?.choices?.[0]?.message?.content?.trim() || '';
  if (/^unknown$/i.test(text)) return null;
  return text || null;
}

const CATEGORY_ID_SET = new Set(RESOURCE_CATEGORIES);

function resolveAiCategoryId(raw: string): string | null {
  const line = (raw.split('\n')[0] || raw).trim().replace(/^["']|["']$/g, '');
  if (CATEGORY_ID_SET.has(line)) return line;
  const lower = line.toLowerCase();
  for (const id of RESOURCE_CATEGORIES) {
    if (id.toLowerCase() === lower) return id;
    const lab = RESOURCE_CATEGORY_LABELS[id];
    if (lab && lab.toLowerCase() === lower) return id;
  }
  return null;
}

/** Pick best category id from title / description (therapist library taxonomy). */
export async function suggestResourceCategory(input: {
  title: string;
  description?: string | null;
  resourceType: 'video' | 'book' | 'article';
}): Promise<string | null> {
  const apiKey = getOpenAiKey();
  if (!apiKey) return null;
  const title = input.title.trim();
  const desc = (input.description || '').trim();
  if (!title && !desc) return null;

  const catalog = RESOURCE_CATEGORIES.map(
    (id) => `${id} (${RESOURCE_CATEGORY_LABELS[id] ?? id})`
  ).join('\n');

  const kind =
    input.resourceType === 'video'
      ? 'YouTube video talk / lecture'
      : input.resourceType === 'article'
        ? 'PDF article'
        : 'PDF book';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You assign a mental health resource to exactly ONE category id from this list for therapists (counselling, psychotherapy, psychiatry). Each line is: id (human label).

${catalog}

Respond with ONLY the category id (the part before the space), e.g. anxiety_disorders. No quotes, no explanation, no other words. If unsure, pick the closest single best fit.`,
        },
        {
          role: 'user',
          content: `Resource type: ${kind}
Title: ${title || '(none)'}
Description: ${desc || '(none)'}`,
        },
      ],
      max_tokens: 40,
      temperature: 0.2,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) return null;
  return resolveAiCategoryId(text);
}
