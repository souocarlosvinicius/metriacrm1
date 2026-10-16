import app from "../src/app.js";

/**
 * ==============================================================================
 * METRIA CRM - VERCEL SERVERLESS FUNCTION ADAPTER
 * ==============================================================================
 * 
 * Este arquivo atua como o ponto de entrada Serverless da Vercel para todas as rotas
 * sob o prefixo /api/*. Ele direciona as requisições HTTP para a aplicação Express,
 * garantindo paridade funcional completa com o runtime Node dedicado (Gemini AI,
 * autenticação, diagnóstico, upload e logs) mesmo em infraestruturas serverless.
 */
export default app;
