import pdf from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '../../infra/supabase.ts';

const CHUNK_SIZE = 2000; 
const MIN_WORD_COUNT = 50;
const MAX_RETRY = 3;


function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình trong .env');
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-2.0-flash' });
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    if (end < text.length) {
      const boundary = text.lastIndexOf(' ', end);
      if (boundary > start) end = boundary;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end + 1;
  }
  return chunks;
}

async function callGemini(prompt: string): Promise<string> {
  const model = getGeminiModel();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err: any) {
      lastError = err;
      const status: number = err?.status ?? err?.httpStatus ?? 0;
      const isRetryable = status === 429 || status === 503 || status === 0;
      if (!isRetryable) throw err;
      if (attempt < MAX_RETRY - 1) {
        const wait = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
        console.warn(`[AI-Summary] Gemini lỗi ${status}, retry sau ${wait}ms (lần ${attempt + 1})`);
        await sleep(wait);
      }
    }
  }
  throw lastError;
}

async function extractText(buffer: Buffer): Promise<string> {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch {
    const err = new Error('Không thể đọc file PDF. File có thể bị hỏng hoặc được bảo vệ bằng mật khẩu.');
    (err as any).code = 'PDF_READ_FAILED';
    throw err;
  }
}

function cleanText(raw: string): string {
  return raw
    .replace(/\f/g, '\n')
    .replace(/^\s*\d+\s*$/gm, '') 
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SYSTEM_PROMPT = `Bạn là trợ lý tóm tắt tài liệu workshop cho sinh viên đại học.
Quy tắc bắt buộc:
- Chỉ dùng thông tin có trong văn bản được cung cấp. KHÔNG tự suy diễn hay bịa đặt.
- Phải đề cập: Mục tiêu workshop, Diễn giả (nếu có), Nội dung chính.
- Dùng gạch đầu dòng và tiêu đề Markdown (##).
- Ngôn ngữ: Tiếng Việt.`;

async function generateSummary(cleanedText: string): Promise<string> {
  const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;

  if (wordCount < MIN_WORD_COUNT) {
    const err = new Error(
      `File PDF không chứa đủ văn bản để tóm tắt (${wordCount} từ, yêu cầu tối thiểu ${MIN_WORD_COUNT} từ).`
    );
    (err as any).code = 'PDF_NO_TEXT';
    throw err;
  }

  const chunks = chunkText(cleanedText);

  if (chunks.length === 1) {
    return callGemini(`${SYSTEM_PROMPT}\n\n---\n${chunks[0]}`);
  }

  console.log(`[AI-Summary] Văn bản dài (${chunks.length} chunks) — áp dụng Map-Reduce`);
  const partials = await Promise.all(
    chunks.map((chunk, i) =>
      callGemini(
        `${SYSTEM_PROMPT}\n\nĐây là phần ${i + 1}/${chunks.length}. Tóm tắt nội dung phần này:\n---\n${chunk}`
      )
    )
  );

  const combined = partials.map((s, i) => `### Phần ${i + 1}\n${s}`).join('\n\n');
  return callGemini(
    `${SYSTEM_PROMPT}\n\nDưới đây là các bản tóm tắt từng phần. Hãy tổng hợp thành một bản duy nhất, mạch lạc:\n\n${combined}`
  );
}

async function persistSummary(workshopId: string, summaryMd: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('workshops')
    .update({
      summary_md: summaryMd,
      summary_generated_at: new Date().toISOString(),
    })
    .eq('id', workshopId);

  if (error) throw error;
}


export class SummaryService {
  async processSummary(workshopId: string, pdfBuffer: Buffer): Promise<void> {
    console.log(`[AI-Summary] Bắt đầu pipeline cho workshop: ${workshopId}`);
    try {
      const rawText     = await extractText(pdfBuffer);
      const cleanedText = cleanText(rawText);
      const summaryMd   = await generateSummary(cleanedText);
      await persistSummary(workshopId, summaryMd);
      console.log(`[AI-Summary] Hoàn tất! Đã lưu summary cho workshop: ${workshopId}`);
    } catch (err: any) {
      console.error(`[AI-Summary] Pipeline thất bại (${err?.code ?? 'UNKNOWN'}):`, err.message ?? err);
    }
  }
}