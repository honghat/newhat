export default function GuideTab() {
  return (
    <div className="fade-in">
      <div className="card" style={{ borderLeft: '4px solid var(--accent)', background: 'var(--surface2)', padding: '24px' }}>
        <h2 className="section-title" style={{ color: 'var(--accent)', fontSize: 20, marginBottom: '20px' }}>📘 Hướng dẫn học Tiếng Anh với NewHat AI</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section>
            <h3 style={{ color: 'var(--green)', fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🎧</span> Luyện Nghe (Listening)
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
              • Nhấn <strong>&quot;🤖 Tạo đoạn nghe mới&quot;</strong> để AI soạn nội dung theo trình độ (A2-B2).<br/>
              • Bạn có thể tự nhập văn bản tiếng Anh vào ô trống để AI đọc cho bạn nghe.<br/>
              • Sử dụng thanh trượt để điều chỉnh tốc độ đọc (0.5x cho người mới bắt đầu).
            </p>
          </section>

          <section>
            <h3 style={{ color: 'var(--purple)', fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🎤</span> Luyện Nói (Speaking)
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
              • Nhấn giữ biểu tượng Micro để ghi âm câu trả lời của bạn.<br/>
              • Sau khi nói xong, nhấn <strong>&quot;🤖 AI chấm điểm&quot;</strong>. AI sẽ phân tích phát âm, chỉ ra lỗi ngữ pháp và gợi ý cách diễn đạt tự nhiên hơn như người bản xứ.
            </p>
          </section>

          <section>
            <h3 style={{ color: 'var(--orange)', fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📖</span> Luyện Đọc & Tra Từ (Reading & Lookup)
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
              • <strong>Tra từ nhanh:</strong> Trong khi đọc bài, hãy <strong>bôi đen</strong> bất kỳ từ hoặc cụm từ nào. AI sẽ ngay lập tức giải thích nghĩa, phiên âm và cách dùng ngay bên cạnh.<br/>
              • <strong>Hỏi đáp:</strong> Bạn có thể nhắn tin hỏi AI bất kỳ điều gì về nội dung bài đọc ở khung chat phía dưới.
            </p>
          </section>

          <section>
            <h3 style={{ color: 'var(--blue)', fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📚</span> Từ Vựng (Vocabulary)
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
              • Hệ thống cung cấp thẻ ghi nhớ (Flashcards) thông minh.<br/>
              • Mỗi từ vựng đều đi kèm phiên âm, ví dụ đặt câu và nghĩa tiếng Việt.<br/>
              • Bạn nên luyện tập hàng ngày để AI giúp ghi nhớ từ vựng vào bộ nhớ dài hạn.
            </p>
          </section>

          <section>
            <h3 style={{ color: 'var(--red)', fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📐</span> Ngữ Pháp (Grammar)
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
              • Chọn một chủ đề ngữ pháp bạn muốn học hoặc tự nhập chủ đề riêng.<br/>
              • AI sẽ giảng giải lý thuyết một cách dễ hiểu và đưa ra <strong>bài tập trắc nghiệm</strong> ngay phía dưới để bạn thực hành và chấm điểm trực tiếp.
            </p>
          </section>

          <div style={{ marginTop: 10, padding: '12px 16px', background: 'rgba(88,166,255,0.08)', borderRadius: 12, border: '1px dashed var(--accent)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            💡 <strong>Mẹo nhỏ:</strong> Hệ thống NewHat được thiết kế để học tập chủ động. Đừng ngần ngại yêu cầu AI tạo thêm ví dụ hoặc giải thích lại những phần bạn chưa rõ nhé!
          </div>
        </div>
      </div>
    </div>
  );
}
