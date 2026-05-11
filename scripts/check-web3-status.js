const API_BASE = process.env.API_BASE || 'http://localhost:6110';

async function main() {
  const response = await fetch(`${API_BASE}/api/web3/status`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(JSON.stringify({ ok: false, status: response.status, data }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));

  if (!data?.readiness?.testDeployUsable) {
    process.exitCode = 1;
  }

  if (data?.solana?.rpcConfigured && !data?.solana?.rpcHealth?.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
