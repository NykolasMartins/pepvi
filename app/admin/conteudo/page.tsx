import { getTemas, getUsoIA } from "@/app/admin-actions";
import { listDifficulties } from "@/app/actions";
import { Secao, Vazio } from "../Painel";
import { TetoDiario, EditorDificuldade, LinhaTema } from "./Gestao";
import NovoTema from "./NovoTema";

export const dynamic = "force-dynamic";

export default async function AdminConteudo() {
  const [temas, dificuldades, ia] = await Promise.all([
    getTemas(),
    listDifficulties(),
    getUsoIA(),
  ]);

  const catalogo = temas.filter((t) => !t.is_custom);
  const custom = temas.filter((t) => t.is_custom);
  const inativos = catalogo.filter((t) => !t.active).length;
  const semDicas = catalogo.filter((t) => t.active && t.dicas === 0).length;

  return (
    <div className="space-y-8">
      <Secao titulo="Limites">
        <TetoDiario atual={ia.limiteDiario} />
      </Secao>

      <Secao
        titulo="Dificuldades"
        nota="O multiplicador existe porque o bônus de velocidade é relativo à duração: sem ele, a dificuldade maior pagaria menos."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {dificuldades.map((d) => (
            <EditorDificuldade key={d.id} d={d} />
          ))}
        </div>
      </Secao>

      <Secao
        titulo={`Catálogo · ${catalogo.length} tema${catalogo.length === 1 ? "" : "s"}`}
        nota={[
          `${catalogo.length - inativos} ativo(s) na roleta`,
          inativos > 0 && `${inativos} desativado(s)`,
          semDicas > 0 && `${semDicas} ativo(s) sem nenhuma dica`,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        <NovoTema />
        {catalogo.length === 0 ? (
          <Vazio>Nenhum tema no catálogo. Rode os seeds ou crie um acima.</Vazio>
        ) : (
          <div className="space-y-2">
            {catalogo.map((t) => (
              <LinhaTema key={t.id} t={t} />
            ))}
          </div>
        )}
      </Secao>

      {custom.length > 0 && (
        <Secao
          titulo={`Temas escritos por alunos · ${custom.length}`}
          nota="Vieram do treino livre. Ficam fora da roleta (active = false) e não são editáveis pelo painel: são escrita pessoal do jogador, não conteúdo editorial."
        >
          <div className="space-y-2">
            {custom.slice(0, 30).map((t) => (
              <LinhaTema key={t.id} t={t} />
            ))}
          </div>
          {custom.length > 30 && (
            <p className="text-xs text-zinc-600">
              mostrando 30 de {custom.length}
            </p>
          )}
        </Secao>
      )}
    </div>
  );
}
