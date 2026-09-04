import { getSaude, getUso } from "@/app/admin-actions";
import { BarraH, Grade, Metrica, Secao, Sparkline, Vazio } from "../Painel";

export const dynamic = "force-dynamic";

export default async function AdminSaude() {
  const [s, uso] = await Promise.all([getSaude(), getUso()]);

  const perdaEnvio =
    uso.funil.iniciadas > 0
      ? 100 - (uso.funil.enviadas / uso.funil.iniciadas) * 100
      : null;

  return (
    <div className="space-y-8">
      <Secao
        titulo="O que está travado agora"
        nota="Não há cron neste projeto: partida vencida e correção travada são materializadas na próxima chamada de iniciar_partida(). Número alto aqui costuma significar que ninguém iniciou partida há um tempo, não que algo quebrou."
      >
        <Grade>
          <Metrica
            rotulo="Presas em correção"
            valor={s.travadasEmCorrecao}
            tom={s.travadasEmCorrecao > 0 ? "ruim" : "bom"}
            nota="mais de 15 min em grading"
          />
          <Metrica
            rotulo="Vencidas não materializadas"
            valor={s.vencidasNaoMaterializadas}
            tom={s.vencidasNaoMaterializadas > 0 ? "alerta" : "bom"}
            nota="ocupam o índice de partida ativa"
          />
          <Metrica
            rotulo="Aguardando nova foto"
            valor={s.aguardandoFoto}
            nota="ilegível, sem consumir a partida"
          />
          <Metrica
            rotulo="Pausadas"
            valor={s.pausadas}
            nota={
              s.pausasQuaseVencidas > 0
                ? `${s.pausasQuaseVencidas} perto das 24 h`
                : "treino livre"
            }
            tom={s.pausasQuaseVencidas > 0 ? "alerta" : "neutro"}
          />
        </Grade>
      </Secao>

      <Secao titulo="Falhas e sinalizações">
        <Grade>
          <Metrica
            rotulo="Falhas de correção (7d)"
            valor={s.falhasCorrecao7d}
            tom={s.falhasCorrecao7d > 0 ? "alerta" : "bom"}
          />
          <Metrica
            rotulo="Fotos ilegíveis (30d)"
            valor={s.fotoIlegivel30d}
            nota="abaixo do gate de legibilidade"
          />
          <Metrica
            rotulo="Sinalizadas"
            valor={s.sinalizadas}
            nota="código da folha ausente ou colagem"
          />
          <Metrica
            rotulo="Abandono antes do envio"
            valor={perdaEnvio === null ? "—" : `${perdaEnvio.toFixed(0)}%`}
            tom={perdaEnvio !== null && perdaEnvio > 50 ? "alerta" : "neutro"}
            nota="iniciaram e não enviaram"
          />
        </Grade>
      </Secao>

      <Secao titulo="Partidas por status">
        {s.porStatus.length === 0 ? (
          <Vazio>Nenhuma partida ainda.</Vazio>
        ) : (
          <BarraH
            itens={s.porStatus.map((p) => ({
              rotulo: p.status,
              valor: p.quantas,
              destaque: p.status === "graded",
            }))}
          />
        )}
      </Secao>

      <Secao
        titulo="Funil"
        nota="Cada degrau perdido é alguém que começou e não terminou."
      >
        <BarraH
          itens={[
            { rotulo: "Iniciadas", valor: uso.funil.iniciadas },
            { rotulo: "Enviadas", valor: uso.funil.enviadas },
            { rotulo: "Corrigidas", valor: uso.funil.corrigidas, destaque: true },
          ]}
        />
      </Secao>

      {uso.cadastrosPorSemana.length >= 2 && (
        <Secao titulo="Cadastros por semana" nota="Últimas 12 semanas.">
          <Sparkline
            valores={uso.cadastrosPorSemana.map((c) => c.quantos)}
            rotulos={uso.cadastrosPorSemana.map((c) => c.semana.slice(5))}
          />
        </Secao>
      )}
    </div>
  );
}
