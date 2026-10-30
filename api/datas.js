// 📅 Datas do Chalé Veraneio — sem banco de dados: o "banco" é o arquivo dados/datas.json no próprio
// repositório do site (GitHub). O painel /admin lê e grava por aqui; a página pública só lê.
//   GET  /api/datas            → { ok, bloqueadas:[YYYY-MM-DD], preco, atualizado }
//   POST /api/datas {senha, bloqueadas, preco} → grava no GitHub (exige ADMIN_SENHA)
// Envs na Vercel: GH_TOKEN (token do GitHub com escrita no repo), GH_REPO (dono/repo), ADMIN_SENHA.
const REPO = process.env.GH_REPO || "hatemadeeveryday/chale-veraneio";
const ARQ = "dados/datas.json";
const BRANCH = process.env.GH_BRANCH || "master";
const API = `https://api.github.com/repos/${REPO}/contents/${ARQ}`;

function cab() {
  return { Authorization: "Bearer " + (process.env.GH_TOKEN || ""), Accept: "application/vnd.github+json", "User-Agent": "chale-veraneio", "X-GitHub-Api-Version": "2022-11-28" };
}
async function ler() {
  const r = await fetch(`${API}?ref=${BRANCH}&t=${Date.now()}`, { headers: cab(), cache: "no-store" });
  if (!r.ok) throw new Error("github_" + r.status);
  const j = await r.json();
  const dados = JSON.parse(Buffer.from(j.content, "base64").toString("utf8"));
  return { sha: j.sha, dados };
}
const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    if (req.method === "GET") {
      if (!process.env.GH_TOKEN) return res.status(200).json({ ok: true, bloqueadas: [], preco: "", aviso: "GH_TOKEN ausente: sem bloqueios" });
      const { dados } = await ler();
      return res.status(200).json({ ok: true, bloqueadas: dados.bloqueadas || [], preco: dados.preco || "", atualizado: dados.atualizado || null });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (!process.env.ADMIN_SENHA) return res.status(500).json({ ok: false, erro: "servidor_sem_senha" });
      if (String(b.senha || "") !== process.env.ADMIN_SENHA) return res.status(401).json({ ok: false, erro: "senha_incorreta" });
      if (!process.env.GH_TOKEN) return res.status(500).json({ ok: false, erro: "servidor_sem_token" });
      // 🪤 lista ausente NÃO vira lista vazia: apagar todos os bloqueios por acidente é pior que recusar
      if (!Array.isArray(b.bloqueadas)) return res.status(400).json({ ok: false, erro: "bloqueadas_precisa_ser_lista" });
      const bloqueadas = Array.from(new Set(b.bloqueadas.map(String).filter((d) => DATA_OK.test(d)))).sort();
      const preco = String(b.preco || "").slice(0, 60);
      const { sha } = await ler();
      const novo = { bloqueadas, preco, atualizado: new Date().toISOString() };
      const r = await fetch(API, {
        method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, cab()),
        body: JSON.stringify({ message: "datas: " + bloqueadas.length + " dia(s) bloqueado(s) pelo painel", content: Buffer.from(JSON.stringify(novo, null, 2) + "\n").toString("base64"), sha, branch: BRANCH }),
      });
      if (!r.ok) return res.status(502).json({ ok: false, erro: "github_" + r.status, detalhe: (await r.text()).slice(0, 300) });
      return res.status(200).json({ ok: true, bloqueadas, preco, atualizado: novo.atualizado });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, erro: "metodo" });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: String(e.message || e) });
  }
};
