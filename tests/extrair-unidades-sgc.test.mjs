import test from 'node:test'
import assert from 'node:assert/strict'
import { parseUnidadesSgc } from '../scripts/extrair-unidades-sgc.mjs'

const page = `
  <select name="page"><option value="1">1</option><option value="2" selected="selected">2</option></select>
  <table id="tbl-solicitacao"><thead><tr><th>Ativo</th><th>Inscrição</th><th>Código</th><th>Regional</th><th>Sede</th><th>Nome</th><th>Cidade</th><th>Ação</th></tr></thead>
  <tbody><tr><td><i class="fas fa-check-circle"></i></td><td><i class="fas fa-times-circle"></i></td><td>E0001.S0000</td><td>R1</td><td>1</td><td><a>ETEC &amp; Escola</a></td><td>São Paulo</td><td><a href="/edit/1">editar</a><a href="/delete/1">excluir</a></td></tr></tbody></table>`

test('extrai todos os campos e a página selecionada do HTML salvo', () => {
  assert.deepEqual(parseUnidadesSgc(page, 'unidades_pagina_2.html'), [{
    ativo: 'Ativo', inscricao: 'Não habilitada', codigo: 'E0001.S0000', regional: 'R1', sede: '1', nome: 'ETEC & Escola', cidade: 'São Paulo', acao_editar_url: '/edit/1', acao_excluir_url: '/delete/1', pagina_sgc: 2, arquivo_origem: 'unidades_pagina_2.html',
  }])
})
