import pdf from 'pdf-parse';
import { supabaseAdmin } from '../../infra/supabase.ts';

export class SummaryService {
  private async extractText(buffer: Buffer): Promise<string> {
    const data = await pdf(buffer);
    return data.text;
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private async generateMockSummary(text: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 3000));

    const wordCount = text.split(' ').length;

    return `### [MOCK AI SUMMARY]
- **Nội dung:** Workshop này tập trung vào các vấn đề chuyên sâu đã nêu trong tài liệu.
- **Độ dài gốc:** ${wordCount} từ.
- **Kết luận:** Đây là một buổi seminar chất lượng cao, sinh viên nên tham dự để nắm vững kiến thức hệ thống phân tán.
- *Lưu ý: Đây là nội dung giả lập do hệ thống không tìm thấy OpenAI Key.*`;
  }

  async processSummary(workshopId: string, pdfBuffer: Buffer) {
    console.log(`[AI-Mock] Đang xử lý PDF cho workshop: ${workshopId}`);
    
    try {
      const rawText = await this.extractText(pdfBuffer);
      const cleanedText = this.cleanText(rawText);

      const summary = await this.generateMockSummary(cleanedText);

      const { error } = await supabaseAdmin
        .from('workshops')
        .update({ 
          summary_md: summary,
          summary_generated_at: new Date().toISOString()
        })
        .eq('id', workshopId);

      if (error) throw error;
      console.log(`[AI-Mock] Hoàn tất! Đã lưu tóm tắt vào Database.`);
    } catch (err) {
      console.error(`[AI-Mock] Lỗi Pipeline:`, err);
    }
  }
}