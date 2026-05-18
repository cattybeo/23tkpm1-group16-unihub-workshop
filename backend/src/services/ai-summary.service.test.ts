import { describe, expect, it, vi } from 'vitest'
import {
  AiSummaryService,
  SummaryServiceError,
  type SummaryAttempt,
  type SummaryErrorCode,
  type SummaryGenerator,
  type SummaryRepository,
  type SummaryState,
  type WorkshopSummaryContext,
} from './ai-summary.service.js'

vi.mock('../lib/supabase.js', () => ({
  supabase: {},
}))

const WORKSHOP_ID = '22222222-2222-2222-2222-222222220003'

function pdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\nmock pdf bytes')
}

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index}`).join(' ')
}

class FakeRepository implements SummaryRepository {
  claimResult: SummaryAttempt | null = {
    workshop_id: WORKSHOP_ID,
    attempts_used: 1,
    status: 'processing',
  }
  state: SummaryState | null = {
    id: WORKSHOP_ID,
    summary_status: 'idle',
    summary_attempts: 0,
    cancelled_at: null,
  }
  context: WorkshopSummaryContext | null = {
    id: WORKSHOP_ID,
    title: 'Workshop RAG',
    description: 'Intro to RAG systems',
    speaker_name: 'Nguyen Minh Khoa',
    speaker_bio: 'AI Engineer',
    room: 'B4.01',
    start_time: '2026-05-25T08:30:00+07:00',
    end_time: '2026-05-25T12:00:00+07:00',
    fee_vnd: 150000,
    capacity: 80,
  }
  completedSummary: string | null = null
  failed: { code: SummaryErrorCode; message: string } | null = null

  async claimAttempt(): Promise<SummaryAttempt | null> {
    return this.claimResult
  }

  async getState(): Promise<SummaryState | null> {
    return this.state
  }

  async getWorkshopContext(): Promise<WorkshopSummaryContext | null> {
    return this.context
  }

  async markCompleted(_workshopId: string, summary: string): Promise<void> {
    this.completedSummary = summary
  }

  async markFailed(_workshopId: string, code: SummaryErrorCode, message: string): Promise<void> {
    this.failed = { code, message }
  }
}

class FakeGenerator implements SummaryGenerator {
  readonly calls: Array<{ input: string; mode: 'chunk' | 'final'; context: WorkshopSummaryContext }> = []
  responses: Array<string | Error | { status: number; message: string }> = ['summary']

  async generate(input: string, mode: 'chunk' | 'final', context: WorkshopSummaryContext): Promise<string> {
    this.calls.push({ input, mode, context })
    const response = this.responses.shift() ?? 'summary'
    if (response instanceof Error) throw response
    if (typeof response === 'object') throw response
    return response
  }
}

describe('AI summary service', () => {
  it('marks PDF_NO_TEXT and does not call AI when extracted text is too short', async () => {
    const repository = new FakeRepository()
    const generator = new FakeGenerator()
    const service = new AiSummaryService(repository, generator, async () => 'too short', 0)

    await service.beginSummary(WORKSHOP_ID, pdfBuffer(), { background: false })

    expect(generator.calls).toHaveLength(0)
    expect(repository.completedSummary).toBeNull()
    expect(repository.failed?.code).toBe('PDF_NO_TEXT')
  })

  it('retries on 429 and then completes', async () => {
    const repository = new FakeRepository()
    const generator = new FakeGenerator()
    generator.responses = [
      { status: 429, message: 'rate limited' },
      '# Summary',
    ]
    const service = new AiSummaryService(repository, generator, async () => words(70), 0)

    await service.beginSummary(WORKSHOP_ID, pdfBuffer(), { background: false })

    expect(generator.calls).toHaveLength(2)
    expect(repository.completedSummary).toBe('# Summary')
    expect(repository.failed).toBeNull()
  })

  it('marks AI_UNAVAILABLE after retry exhaustion and keeps old summary untouched', async () => {
    const repository = new FakeRepository()
    repository.completedSummary = 'old summary'
    const generator = new FakeGenerator()
    generator.responses = [
      { status: 503, message: 'unavailable' },
      { status: 503, message: 'unavailable' },
      { status: 503, message: 'unavailable' },
    ]
    const service = new AiSummaryService(repository, generator, async () => words(70), 0)

    await service.beginSummary(WORKSHOP_ID, pdfBuffer(), { background: false })

    expect(generator.calls).toHaveLength(3)
    expect(repository.completedSummary).toBe('old summary')
    expect(repository.failed?.code).toBe('AI_UNAVAILABLE')
  })

  it('maps in-progress claims to SUMMARY_IN_PROGRESS', async () => {
    const repository = new FakeRepository()
    repository.claimResult = null
    repository.state = {
      id: WORKSHOP_ID,
      summary_status: 'processing',
      summary_attempts: 1,
      cancelled_at: null,
    }
    const service = new AiSummaryService(repository, new FakeGenerator(), async () => words(70), 0)

    await expect(service.beginSummary(WORKSHOP_ID, pdfBuffer(), { background: false }))
      .rejects
      .toMatchObject({ code: 'SUMMARY_IN_PROGRESS', status: 409 } satisfies Partial<SummaryServiceError>)
  })

  it('maps exhausted claims to SUMMARY_LIMIT_REACHED', async () => {
    const repository = new FakeRepository()
    repository.claimResult = null
    repository.state = {
      id: WORKSHOP_ID,
      summary_status: 'failed',
      summary_attempts: 3,
      cancelled_at: null,
    }
    const service = new AiSummaryService(repository, new FakeGenerator(), async () => words(70), 0)

    await expect(service.beginSummary(WORKSHOP_ID, pdfBuffer(), { background: false }))
      .rejects
      .toMatchObject({ code: 'SUMMARY_LIMIT_REACHED', status: 409 } satisfies Partial<SummaryServiceError>)
  })

  it('uses map-reduce for long text', async () => {
    const repository = new FakeRepository()
    const generator = new FakeGenerator()
    generator.responses = ['chunk 1', 'chunk 2', 'final summary']
    const service = new AiSummaryService(repository, generator, async () => words(3000), 0)

    await service.beginSummary(WORKSHOP_ID, pdfBuffer(), { background: false })

    expect(generator.calls.length).toBeGreaterThan(1)
    expect(generator.calls.at(-1)?.mode).toBe('final')
    expect(repository.completedSummary).toBe('final summary')
  })
})
