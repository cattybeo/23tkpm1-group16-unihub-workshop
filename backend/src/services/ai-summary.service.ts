import pdf from 'pdf-parse'
import { supabase } from '../lib/supabase.js'

const MAX_PDF_BYTES = 5 * 1024 * 1024
const MIN_TEXT_WORDS = 50
const CHUNK_SIZE = 15_000
const MAX_AI_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 2_000

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODELS = [
  'deepseek/deepseek-v4-flash:free',
  'google/gemma-4-31b-it:free',
  'google/gemini-2.5-flash-lite',
]

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>
}

export type SummaryStatus = 'idle' | 'processing' | 'completed' | 'failed'

export type SummaryErrorCode =
  | 'PDF_INVALID_TYPE'
  | 'PDF_READ_FAILED'
  | 'PDF_NO_TEXT'
  | 'SUMMARY_IN_PROGRESS'
  | 'SUMMARY_LIMIT_REACHED'
  | 'AI_UNAVAILABLE'
  | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_FAILED'

export interface SummaryState {
  id: string
  summary_status: SummaryStatus | null
  summary_attempts: number | null
  cancelled_at: string | null
}

export interface SummaryAttempt {
  workshop_id: string
  attempts_used: number
  status: 'processing'
}

export interface WorkshopSummaryContext {
  id: string
  title: string
  description: string | null
  speaker_name: string
  speaker_bio: string | null
  room: string
  start_time: string
  end_time: string
  fee_vnd: number
  capacity: number
}

export interface SummaryRepository {
  claimAttempt(workshopId: string): Promise<SummaryAttempt | null>
  getState(workshopId: string): Promise<SummaryState | null>
  getWorkshopContext(workshopId: string): Promise<WorkshopSummaryContext | null>
  markCompleted(workshopId: string, summary: string): Promise<void>
  markFailed(workshopId: string, code: SummaryErrorCode, message: string): Promise<void>
}

export interface SummaryGenerator {
  generate(input: string, mode: 'chunk' | 'final', context: WorkshopSummaryContext): Promise<string>
}

export interface BeginSummaryOptions {
  background?: boolean
}

export interface BeginSummaryResult {
  workshop_id: string
  status: 'processing'
  attempts_used: number
  attempts_remaining: number
}

export class SummaryServiceError extends Error {
  constructor(
    readonly code: SummaryErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'SummaryServiceError'
  }
}

class SupabaseSummaryRepository implements SummaryRepository {
  async claimAttempt(workshopId: string): Promise<SummaryAttempt | null> {
    const { data, error } = await supabase
      .rpc('claim_workshop_summary_attempt', { p_workshop_id: workshopId })

    if (error) throw new SummaryServiceError('VALIDATION_FAILED', error.message, 500)
    const rows = Array.isArray(data) ? data as unknown as SummaryAttempt[] : []
    return rows[0] ?? null
  }

  async getState(workshopId: string): Promise<SummaryState | null> {
    const { data, error } = await supabase
      .from('workshops')
      .select('id, summary_status, summary_attempts, cancelled_at')
      .eq('id', workshopId)
      .maybeSingle<SummaryState>()

    if (error) throw new SummaryServiceError('VALIDATION_FAILED', error.message, 500)
    return data ?? null
  }

  async getWorkshopContext(workshopId: string): Promise<WorkshopSummaryContext | null> {
    const { data, error } = await supabase
      .from('workshops')
      .select('id, title, description, speaker_name, speaker_bio, room, start_time, end_time, fee_vnd, capacity')
      .eq('id', workshopId)
      .is('cancelled_at', null)
      .maybeSingle<WorkshopSummaryContext>()

    if (error) throw new SummaryServiceError('VALIDATION_FAILED', error.message, 500)
    return data ?? null
  }

  async markCompleted(workshopId: string, summary: string): Promise<void> {
    const { error } = await supabase
      .from('workshops')
      .update({
        summary_md: summary,
        summary_generated_at: new Date().toISOString(),
        summary_status: 'completed',
        summary_error_code: null,
        summary_error_message: null,
      })
      .eq('id', workshopId)

    if (error) throw new SummaryServiceError('VALIDATION_FAILED', error.message, 500)
  }

  async markFailed(workshopId: string, code: SummaryErrorCode, message: string): Promise<void> {
    const { error } = await supabase
      .from('workshops')
      .update({
        summary_status: 'failed',
        summary_error_code: code,
        summary_error_message: message,
      })
      .eq('id', workshopId)

    if (error) throw new SummaryServiceError('VALIDATION_FAILED', error.message, 500)
  }
}

class OpenRouterSummaryGenerator implements SummaryGenerator {
  private readonly apiKey: string

  constructor() {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new SummaryServiceError('AI_UNAVAILABLE', 'OPENROUTER_API_KEY is not configured', 503)
    }
    this.apiKey = process.env.OPENROUTER_API_KEY
  }

  async generate(input: string, mode: 'chunk' | 'final', context: WorkshopSummaryContext): Promise<string> {
    const systemPrompt = [
      'Bạn là trợ lý học thuật cho hệ thống UniHub Workshop.',
      'Chỉ dùng thông tin có trong context và văn bản PDF được cung cấp, không tự suy diễn.',
      'Luôn trả về Markdown tiếng Việt hợp lệ, không thêm giải thích ngoài nội dung summary.',
      'Phải tuân thủ đúng schema sau:',
      '# {Tên workshop}',
      '**Chủ đề:** ...',
      '## Mục tiêu',
      '- ...',
      '## Diễn giả',
      '- ...',
      '## Thời gian & Địa điểm',
      '- Ngày: ...',
      '- Giờ: ...',
      '- Phòng: ...',
      '- Sức chứa: ...',
      '- Phí: ...',
      '## Nội dung chính',
      '- ...',
      '- ...',
      'Nếu PDF không có một mục, dùng dữ liệu context khi chắc chắn có. Nếu vẫn thiếu thì bỏ qua chi tiết đó, không bịa.',
      'Không dùng HTML. Không trả về fenced code block.',
    ].join('\n')

    const contextBlock = [
      `Tên workshop: ${context.title}`,
      `Mô tả: ${context.description ?? 'Không có'}`,
      `Diễn giả: ${context.speaker_name}`,
      `Tiểu sử diễn giả: ${context.speaker_bio ?? 'Không có'}`,
      `Phòng: ${context.room}`,
      `Bắt đầu: ${context.start_time}`,
      `Kết thúc: ${context.end_time}`,
      `Sức chứa: ${context.capacity}`,
      `Phí: ${context.fee_vnd} VND`,
    ].join('\n')

    const userPrompt = mode === 'chunk'
      ? `Context workshop:\n${contextBlock}\n\nVăn bản PDF đoạn này:\n${input}\n\nTóm tắt đoạn này thành các ý ngắn phục vụ bước tổng hợp cuối.`
      : `Context workshop:\n${contextBlock}\n\nDữ liệu để tổng hợp:\n${input}\n\nTạo bản AI Summary cuối cùng đúng schema Markdown đã yêu cầu.`

    let lastError: unknown
    for (const model of OPENROUTER_MODELS) {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://unihub.local',
          'X-Title': 'UniHub Workshop',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      })

      if (res.status === 429 || res.status === 503) {
        const body = await res.text()
        console.warn(`[OpenRouter] model ${model} rate-limited (${res.status}), trying next...`)
        lastError = Object.assign(new Error(`OpenRouter API error ${res.status}: ${body}`), { status: res.status })
        continue
      }

      if (!res.ok) {
        const body = await res.text()
        console.error(`[OpenRouter] HTTP ${res.status}:`, body)
        throw Object.assign(new Error(`OpenRouter API error ${res.status}: ${body}`), { status: res.status })
      }

      const data = await res.json() as OpenRouterResponse
      const content = data.choices[0]?.message?.content?.trim()
      if (!content) {
        throw new SummaryServiceError('AI_UNAVAILABLE', 'OpenRouter returned an empty summary', 503)
      }
      return content
    }

    throw lastError ?? new SummaryServiceError('AI_UNAVAILABLE', 'All OpenRouter models rate-limited', 503)
  }
}

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length > 5 && buffer.subarray(0, 5).toString('utf8') === '%PDF-'
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getStatusFromError(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const status = 'status' in error ? (error as { status?: unknown }).status : undefined
  return typeof status === 'number' ? status : null
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể tạo tóm tắt AI. Vui lòng thử lại sau.'
}

function toSummaryError(error: unknown): SummaryServiceError {
  if (error instanceof SummaryServiceError) return error

  const status = getStatusFromError(error)
  if (status === 429 || status === 503) {
    return new SummaryServiceError('AI_UNAVAILABLE', toErrorMessage(error), 503)
  }

  return new SummaryServiceError('VALIDATION_FAILED', toErrorMessage(error), 500)
}

export class AiSummaryService {
  private defaultGenerator: SummaryGenerator | null = null

  constructor(
    private readonly repository: SummaryRepository = new SupabaseSummaryRepository(),
    private readonly generator: SummaryGenerator | null = null,
    private readonly extractPdfText: (buffer: Buffer) => Promise<string> = async (buffer) => {
      const data = await pdf(buffer)
      return data.text
    },
    private readonly retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  ) {}

  async beginSummary(
    workshopId: string,
    pdfBuffer: Buffer,
    options: BeginSummaryOptions = {},
  ): Promise<BeginSummaryResult> {
    this.validatePdf(pdfBuffer)

    const claim = await this.repository.claimAttempt(workshopId)
    if (!claim) {
      await this.throwClaimError(workshopId)
    }

    const attempt = claim as SummaryAttempt
    const process = this.processClaimedSummary(workshopId, pdfBuffer)
    if (options.background === false) {
      await process
    } else {
      void process.catch(error => {
        console.error('[ai-summary] unhandled pipeline error:', error)
      })
    }

    return {
      workshop_id: attempt.workshop_id,
      status: 'processing',
      attempts_used: attempt.attempts_used,
      attempts_remaining: Math.max(3 - attempt.attempts_used, 0),
    }
  }

  async processClaimedSummary(workshopId: string, pdfBuffer: Buffer): Promise<void> {
    try {
      const context = await this.repository.getWorkshopContext(workshopId)
      if (!context) {
        throw new SummaryServiceError('RESOURCE_NOT_FOUND', 'Workshop not found or cancelled', 404)
      }

      const rawText = await this.readPdf(pdfBuffer)
      const cleanedText = this.cleanText(rawText)
      if (countWords(cleanedText) < MIN_TEXT_WORDS) {
        throw new SummaryServiceError(
          'PDF_NO_TEXT',
          'File PDF không chứa đủ văn bản khả dụng để tóm tắt.',
          400,
        )
      }

      const summary = await this.generateSummary(cleanedText, context)
      await this.repository.markCompleted(workshopId, summary)
    } catch (error) {
      const summaryError = toSummaryError(error)
      await this.repository.markFailed(workshopId, summaryError.code, summaryError.message)
    }
  }

  private validatePdf(pdfBuffer: Buffer): void {
    if (pdfBuffer.length === 0) {
      throw new SummaryServiceError('PDF_INVALID_TYPE', 'Vui lòng gửi file PDF.', 400)
    }

    if (pdfBuffer.length > MAX_PDF_BYTES) {
      throw new SummaryServiceError('PDF_INVALID_TYPE', 'File PDF vượt quá giới hạn 5MB.', 400)
    }

    if (!isPdfBuffer(pdfBuffer)) {
      throw new SummaryServiceError('PDF_INVALID_TYPE', 'File tải lên không phải PDF hợp lệ.', 400)
    }
  }

  private async throwClaimError(workshopId: string): Promise<never> {
    const state = await this.repository.getState(workshopId)
    if (!state || state.cancelled_at !== null) {
      throw new SummaryServiceError('RESOURCE_NOT_FOUND', 'Workshop not found or cancelled', 404)
    }

    if (state.summary_status === 'processing') {
      throw new SummaryServiceError('SUMMARY_IN_PROGRESS', 'Workshop này đang được tóm tắt.', 409)
    }

    if ((state.summary_attempts ?? 0) >= 3) {
      throw new SummaryServiceError('SUMMARY_LIMIT_REACHED', 'Workshop này đã dùng hết 3 lần tóm tắt.', 409)
    }

    throw new SummaryServiceError('VALIDATION_FAILED', 'Không thể bắt đầu tóm tắt.', 500)
  }

  private async readPdf(pdfBuffer: Buffer): Promise<string> {
    try {
      return await this.extractPdfText(pdfBuffer)
    } catch (error) {
      throw new SummaryServiceError('PDF_READ_FAILED', toErrorMessage(error), 400)
    }
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r/g, '\n')
      .replace(/^\s*\d+\s*$/gm, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  private chunkText(text: string): string[] {
    const chunks: string[] = []
    let cursor = 0

    while (cursor < text.length) {
      const hardEnd = Math.min(cursor + CHUNK_SIZE, text.length)
      const softEnd = hardEnd < text.length ? text.lastIndexOf(' ', hardEnd) : hardEnd
      const end = softEnd > cursor + Math.floor(CHUNK_SIZE * 0.6) ? softEnd : hardEnd
      chunks.push(text.slice(cursor, end).trim())
      cursor = end
    }

    return chunks.filter(Boolean)
  }

  private async generateSummary(text: string, context: WorkshopSummaryContext): Promise<string> {
    const chunks = this.chunkText(text)
    if (chunks.length === 1) {
      return this.generateWithRetry(chunks[0] ?? text, 'final', context)
    }

    const partialSummaries: string[] = []
    for (const chunk of chunks) {
      partialSummaries.push(await this.generateWithRetry(chunk, 'chunk', context))
    }

    return this.generateWithRetry(partialSummaries.join('\n\n'), 'final', context)
  }

  private async generateWithRetry(input: string, mode: 'chunk' | 'final', context: WorkshopSummaryContext): Promise<string> {
    const generator = this.getGenerator()
    for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt += 1) {
      try {
        return await generator.generate(input, mode, context)
      } catch (error) {
        const status = getStatusFromError(error)
        const canRetry = (status === 429 || status === 503) && attempt < MAX_AI_ATTEMPTS
        if (!canRetry) {
          throw status === 429 || status === 503
            ? new SummaryServiceError('AI_UNAVAILABLE', toErrorMessage(error), 503)
            : error
        }
        if (this.retryDelayMs > 0) {
          await sleep(this.retryDelayMs * 2 ** (attempt - 1))
        }
      }
    }

    throw new SummaryServiceError('AI_UNAVAILABLE', 'AI retry exhausted', 503)
  }

  private getGenerator(): SummaryGenerator {
    if (this.generator) return this.generator
    this.defaultGenerator ??= new OpenRouterSummaryGenerator()
    return this.defaultGenerator
  }
}
