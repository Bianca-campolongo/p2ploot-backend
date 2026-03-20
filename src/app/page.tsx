export default function Home() {
  return (
    <div style={{ 
      fontFamily: 'system-ui, sans-serif',
      padding: '2rem',
      maxWidth: '800px',
      margin: '0 auto',
      textAlign: 'center'
    }}>
      <h1>Talon API</h1>
      <p>API está funcionando corretamente.</p>
      <p style={{ color: '#666', marginTop: '2rem' }}>
        Acesse <code>/api</code> para usar os endpoints da API.
      </p>
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Endpoints disponíveis:</h3>
        <ul style={{ textAlign: 'left', display: 'inline-block' }}>
          <li><code>GET /api/health</code> - Health check</li>
          <li><code>POST /api/auth/login</code> - Login</li>
          <li><code>GET /api/auth/discord/authorize</code> - Discord OAuth</li>
          <li><code>GET /api/profiles/me</code> - Perfil do usuário</li>
          <li><code>GET /api/guilds</code> - Listar guildas</li>
          <li><code>POST /api/guilds</code> - Criar guilda</li>
        </ul>
      </div>
    </div>
  );
}
