import pdf from 'pdf-parse';
import { supabaseAdmin } from '../../infra/supabase.js';

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT =
  'Bạn là AI tóm tắt nội dung workshop học thuật. ' +
  'Tóm tắt CHÍNH XÁC từ văn bản được cung cấp, KHÔNG tự suy diễn hay thêm thông tin ngoài. ' +
  'Output phải có ít nhất 3 mục: ## Mục tiêu, ## Nội dung chính, ## Diễn giả. ' +
  'Dùng Markdown (##, **, - bullet). Tối đa 300 từ. Viết tiếng Việt.';

const CHUNK_SIZE = 2000;
const MIN_WORDS = 50;

export class SummaryService {
  private async extractText(buffer: Buffer): Promise<string> {
    const data = await pdf(buffer);
    return data.text;
  }

  private cleanText(raw: string): string {
    return raw
      .replace(/\f/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async callGemini(prompt: string, retries = 3): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    for (let attempt = 1; attempt <= retries; attempt++) {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        }),
      });

      if (res.status === 429 || res.status === 503) {
        if (attempt === retries) throw new Error(`Gemini rate limit exceeded after ${retries} attempts`);
        const backoff = 1000 * Math.pow(2, attempt - 1); // 1s → 2s → 4s
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${body}`);
      }

      const data = await res.json() as GeminiResponse;
      return data.candidates[0].content.parts[0].text;
    }

    throw new Error('Gemini: all retries exhausted');
  }

  private async generateSummary(text: string): Promise<string> {
    if (text.length <= CHUNK_SIZE * 2) {
      return this.callGemini(`${SYSTEM_PROMPT}\n\n---\n\n${text}`);
    }

    // Map-reduce: chunk → partial summaries → merge (sequential to avoid rate limits)
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    const partials: string[] = [];
    for (const chunk of chunks) {
      const partial = await this.callGemini(
        `Tóm tắt ngắn gọn đoạn văn sau (tiếng Việt, tối đa 100 từ):\n\n${chunk}`,
      );
      partials.push(partial);
    }

    return this.callGemini(
      `${SYSTEM_PROMPT}\n\nDựa trên các bản tóm tắt từng phần sau, tổng hợp thành 1 bản tóm tắt hoàn chỉnh:\n\n${partials.join('\n\n---\n\n')}`,
    );
  }

  async processSummary(workshopId: string, pdfBuffer: Buffer): Promise<void> {
    console.log(`[AI-Summary] Processing PDF for workshop: ${workshopId}`);

    try {
      const rawText = await this.extractText(pdfBuffer);
      const cleanedText = this.cleanText(rawText);

      const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;
      if (wordCount < MIN_WORDS) {
        console.warn(`[AI-Summary] PDF text too short (${wordCount} words). Aborting.`);
        throw new Error('PDF_NO_TEXT');
      }

      const summary = await this.generateSummary(cleanedText);

      const { error } = await supabaseAdmin
        .from('workshops')
        .update({
          summary_md: summary,
          summary_generated_at: new Date().toISOString(),
        })
        .eq('id', workshopId);

      if (error) throw error;
      console.log(`[AI-Summary] Done. Summary saved for workshop: ${workshopId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AI-Summary] Pipeline failed for ${workshopId}: ${msg}`);
    }
  }
}
