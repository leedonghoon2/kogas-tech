export default function SetupNotice() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>⚙️ Supabase 연결 설정이 필요합니다</h1>
        <p>
          환경변수 <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>가 설정되지 않았습니다.
        </p>
        <ol className="small">
          <li>
            로컬 개발: 프로젝트 루트에 <code>.env.local</code> 파일을 만들고 <code>.env.example</code> 내용을 참고해 값을
            입력한 뒤 <code>npm run dev</code>를 다시 실행하세요.
          </li>
          <li>
            Cloudflare 배포: Workers 프로젝트 설정 → <b>Build</b> → <b>Variables and secrets</b>에 위 두 값을 추가하고
            다시 배포하세요. (Vite 환경변수는 빌드 시점에 반영됩니다.)
          </li>
        </ol>
        <p className="muted small">자세한 내용은 README.md를 참고하세요.</p>
      </div>
    </div>
  );
}
