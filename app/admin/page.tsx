import Link from "next/link";
import { getUsoIA, getSaude, getUso, getQualidade } from "@/app/admin-actions";
import { Grade, Metrica, Secao, Vazio } from "./Painel";

export const dynamic = "force-dynamic";

/**
 * Visão geral: só o que exige ação hoje.
 *
 * A tentação num painel de dono é mostrar tudo na primeira tela. O resultado é
 * uma parede de números onde o problema real se esconde — então aqui ficam a
 * cota (que estoura e derruba a correção de todo mundo) e os alertas, e o resto
 * mora nas abas.
 */
export default async function AdminHome() {
  const [ia, saude, uso, qualidade] = await Promise.all([
    getUsoIA(),
    getSaude(),
    getUso(),
    getQualidade(),
  ]);

  // A cota do Gemini é por CHAMADA, não por redação: manuscrita gasta duas.
  const alertas: { texto: string; href: string; grave: boolean }[] = [];
  if (saude.travadasEmCorrecao > 0)
    alertas.push({
      texto: `${saude.travadasEmCorrecao} partida(s) presa(s) em correção há mais de 15 min`,
      href: "/admin/saude",
      grave: true,
    });
  if (saude.vencidasNaoMaterializadas > 0)
    alertas.push({
      texto: `${saude.vencidasNaoMaterializadas} partida(s) vencida(s) ainda ocupando o índice de partida ativa`,
      href: "/admin/saude",
      grave: true,
    });
  if (saude.falhasCorrecao7d > 0)
    alertas.push({
      texto: `${saude.falhasCorrecao7d} falha(s) de correção nos últimos 7 dias`,
      href: "/admin/saude",
      grave: false,
    });
  if (qualidade.suspeitas > 0)
    alertas.push({
      texto: `${qualidade.suspeitas} correção(ões) com as cinco competências idênticas`,
      href: "/admin/qualidade",
      grave: false,
    });
  if (saude.pausasQuaseVencidas > 0)
    alertas.push({
      texto: `${saude.pausasQuaseVencidas} pausa(s) prestes a estourar as 24 h e encerrar a partida`,
      href: "/admin/saude",
      grave: false,
    });

  return (
    <div className="space-y-8">
      {alertas.length > 0 ? (
        <Secao titulo="Precisa de atenção">
          <ul className="space-y-2">
            {alertas.map((a) => (
              <li key={a.texto}>
                <Link
                  href={a.href}
                  className={`block rounded-lg border p-3 text-sm transition hover:brightness-125 ${
                    a.grave
                      ? "border-red-900/60 bg-red-950/30 text-red-200"
                      : "border-amber-900/60 bg-amber-950/20 text-amber-200"
                  }`}
                >
                  {a.texto}
                </Link>
              </li>
            ))}
          </ul>
        </Secao>
      ) : (
        <Vazio>Nada exigindo atenção agora.</Vazio>
      )}

      <Secao
        titulo="Cota de IA nas últimas 24 horas"
        nota="Uma redação manuscrita custa duas chamadas (transcrição e avaliação); digitada custa uma. A cota do Gemini é diária e compartilhada por todos os jogadores."
      >
        <Grade>
          <Metrica
            rotulo="Chamadas de IA"
            valor={ia.chamadas24h}
            tom={ia.chamadas24h > 15 ? "ruim" : ia.chamadas24h > 8 ? "alerta" : "bom"}
            nota="confira o teto real em aistudio.google.com/rate-limit"
          />
          <Metrica rotulo="Redações enviadas" valor={ia.redacoes24h} />
          <Metrica
            rotulo="Teto por usuário"
            valor={ia.limiteDiario}
            sufixo="/24h"
            nota="ajustável em Conteúdo"
          />
          <Metrica rotulo="Usuários ativos (7d)" valor={uso.ativos7d} />
        </Grade>
      </Secao>

      <Secao titulo="Números do produto">
        <Grade>
          <Metrica rotulo="Usuários" valor={uso.usuarios} />
          <Metrica
            rotulo="Redações corrigidas"
            valor={uso.funil.corrigidas}
            nota={`de ${uso.funil.iniciadas.toLocaleString("pt-BR")} iniciadas`}
          />
          <Metrica
            rotulo="Nota média"
            valor={qualidade.porVersao.length > 0 ? Math.round(
              qualidade.porVersao.reduce((s, v) => s + v.media * v.correcoes, 0) /
                Math.max(1, qualidade.porVersao.reduce((s, v) => s + v.correcoes, 0))
            ) : "—"}
            sufixo="/1000"
          />
          <Metrica
            rotulo="Treino livre"
            valor={uso.livreVsValendo.livre}
            nota={`contra ${uso.livreVsValendo.valendo.toLocaleString("pt-BR")} valendo XP`}
          />
        </Grade>
      </Secao>
    </div>
  );
}
