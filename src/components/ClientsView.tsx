import React, { useState, useEffect } from "react";
import { Client, User, Task, Proposal, Visit } from "../types";
import { getClientAlerts, getAlertBadgeStyles } from "../utils/alerts";
import { Search, UserPlus, Mail, Phone, Plus, X, Save, Loader2, Check, AlertTriangle, Download, Upload, FileText, CheckCircle2 } from "lucide-react";
import { exportClientsToCSV } from "../utils/csvExport";
import { exportClientReportToPDF, exportClientsListToPDF } from "../utils/pdfExport";

// Helper to parse CSV, handling quotes, commas and semicolons
const parseCSV = (text: string) => {
  const firstLine = text.split('\n')[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip LF
      }
      currentRow.push(currentField.trim());
      if (currentRow.length > 1 || currentRow[0] !== '') {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.length > 1 || currentRow[0] !== '') {
      rows.push(currentRow);
    }
  }

  return { rows, delimiter };
};

// Automap CSV headers to Client properties
const autoMapColumns = (headers: string[]): Record<string, number> => {
  const mappings: Record<string, number> = {};
  const fieldsToMatch: Record<string, string[]> = {
    name: ['nome', 'name', 'cliente', 'nome completo', 'nome_completo', 'full name', 'fullname', 'contato', 'contact', 'razao social', 'razão social', 'razaosocial'],
    phone: ['telefone', 'phone', 'celular', 'tel', 'whatsapp', 'whats', 'mobile', 'cell', 'fone', 'contato_tel'],
    email: ['email', 'e-mail', 'mail', 'correio', 'contato_email'],
    clientType: ['tipo', 'clienttype', 'tipo_cliente', 'tipo de cliente', 'pf/pj', 'pf_pj', 'pf_ou_pj'],
    document: ['documento', 'document', 'cpf', 'cnpj', 'cpf_cnpj', 'cpf/cnpj', 'doc'],
    profileType: ['perfil', 'profile', 'profiletype', 'tipo_perfil', 'tipo de perfil'],
    status: ['status', 'fase', 'etapa', 'situacao', 'situação'],
    interest: ['interesse', 'objetivo', 'interest', 'objective', 'tipo_interesse'],
    propertyType: ['tipo_imovel', 'tipo de imovel', 'tipo de imóvel', 'property_type', 'propertytype', 'imovel', 'imóvel'],
    budgetRange: ['orcamento', 'orçamento', 'budget', 'budget_range', 'faixa_preco', 'faixa de preço', 'valor', 'faixa'],
    neighborhoodOfInterest: ['bairro', 'neighborhood', 'bairro_interesse', 'bairros'],
    temperature: ['temperatura', 'temperature', 'lead_temperature', 'frio_morno_quente'],
    observations: ['observacoes', 'observações', 'obs', 'observations', 'notes', 'notas', 'comentarios', 'comentários', 'descrição', 'descricao']
  };

  // Clear mappings
  Object.keys(fieldsToMatch).forEach(field => {
    mappings[field] = -1;
  });

  headers.forEach((header, colIdx) => {
    const normHeader = header
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-z0-9\s/_]/g, ""); // clean special chars

    for (const [field, synonyms] of Object.entries(fieldsToMatch)) {
      if (mappings[field] !== -1) continue;

      const hasMatch = synonyms.some(synonym => {
        const normSynonym = synonym
          .toLowerCase()
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return normHeader === normSynonym || normHeader.includes(normSynonym);
      });

      if (hasMatch) {
        mappings[field] = colIdx;
        break;
      }
    }
  });

  return mappings;
};


interface ClientsViewProps {
  clients: Client[];
  tasks?: Task[];
  proposals?: Proposal[];
  visits?: Visit[];
  onAddClient: (client: Omit<Client, "id">) => Promise<void>;
  onSelectClient: (client: Client) => void;
  currentUser?: User | null;
}

export default function ClientsView({ 
  clients, 
  tasks = [], 
  proposals = [], 
  visits = [], 
  onAddClient, 
  onSelectClient, 
  currentUser 
}: ClientsViewProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // CSV Import state variables
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "map" | "preview" | "importing" | "success">("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [fieldMappings, setFieldMappings] = useState<Record<string, number>>({
    name: -1,
    phone: -1,
    email: -1,
    clientType: -1,
    document: -1,
    profileType: -1,
    status: -1,
    interest: -1,
    propertyType: -1,
    budgetRange: -1,
    neighborhoodOfInterest: -1,
    temperature: -1,
    observations: -1,
  });
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: { row: number; name: string; error: string }[] }>({
    success: 0,
    failed: 0,
    errors: []
  });

  const SCHEMA_FIELDS = [
    { key: "name", label: "Nome Completo / Razão Social", required: true },
    { key: "phone", label: "Telefone / Celular", required: true },
    { key: "email", label: "E-mail", required: false },
    { key: "clientType", label: "Tipo de Cliente (PF/PJ)", required: false },
    { key: "document", label: "CPF / CNPJ", required: false },
    { key: "profileType", label: "Perfil (Lead, Comprador, etc.)", required: false },
    { key: "status", label: "Status (Novo, Em Atendimento, etc.)", required: false },
    { key: "interest", label: "Interesse (Compra, Venda, etc.)", required: false },
    { key: "propertyType", label: "Tipo de Imóvel Desejado", required: false },
    { key: "budgetRange", label: "Faixa de Orçamento", required: false },
    { key: "neighborhoodOfInterest", label: "Bairro de Interesse", required: false },
    { key: "temperature", label: "Temperatura (Frio, Morno, Quente)", required: false },
    { key: "observations", label: "Observações", required: false },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setCsvFile(file);
    setCsvFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const { rows } = parseCSV(text);
      if (rows.length === 0) {
        alert("O arquivo CSV está vazio ou inválido.");
        return;
      }

      const headers = rows[0];
      const dataRows = rows.slice(1);

      setCsvHeaders(headers);
      setCsvRows(dataRows);

      // Auto map columns
      const autoMappings = autoMapColumns(headers);
      setFieldMappings(autoMappings);

      setImportStep("map");
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.name.endsWith(".csv")) {
        processFile(file);
      } else {
        alert("Por favor, selecione um arquivo CSV.");
      }
    }
  };

  const getMappedClient = (row: string[]): Omit<Client, "id"> => {
    const getValue = (field: string, defaultValue: any = ""): string => {
      const colIdx = fieldMappings[field];
      if (colIdx === undefined || colIdx === -1 || colIdx >= row.length) {
        return defaultValue;
      }
      return row[colIdx] || defaultValue;
    };

    const clientTypeRaw = getValue("clientType", "PF");
    const clientType: "PF" | "PJ" = (clientTypeRaw.toUpperCase().includes("PJ") || clientTypeRaw.toUpperCase().includes("JURIDICA") || clientTypeRaw.toUpperCase().includes("JURÍDICA")) ? "PJ" : "PF";

    const nameVal = getValue("name", "").trim();
    const phoneVal = getValue("phone", "").trim();
    const emailVal = getValue("email", "").trim();
    const documentVal = getValue("document", "").trim();
    const profileTypeVal = getValue("profileType", "Lead").trim();
    const statusVal = getValue("status", "Novo").trim();
    const interestVal = getValue("interest", "Compra").trim();
    const propertyTypeVal = getValue("propertyType", "Qualquer").trim();
    const budgetRangeVal = getValue("budgetRange", "").trim();
    const neighborhoodVal = getValue("neighborhoodOfInterest", "").trim();
    const tempRaw = getValue("temperature", "Morno").trim().toLowerCase();
    
    let temperature: "Frio" | "Morno" | "Quente" = "Morno";
    if (tempRaw.includes("frio")) temperature = "Frio";
    else if (tempRaw.includes("quente")) temperature = "Quente";

    const obsRaw = getValue("observations", "").trim();
    const observations = obsRaw ? `${obsRaw}\n\n[Importado via CSV em ${new Date().toLocaleDateString("pt-BR")}]` : `[Importado via CSV em ${new Date().toLocaleDateString("pt-BR")}]`;

    return {
      clientType,
      name: nameVal,
      phone: phoneVal,
      document: documentVal,
      email: emailVal,
      profileType: profileTypeVal,
      objective: interestVal === "Venda" ? "Venda" : "Compra",
      propertyType: propertyTypeVal,
      minBudget: 0,
      maxBudget: 0,
      observations,
      status: statusVal,
      leadSource: getValue("leadSource", "Outro").trim(),
      interest: interestVal,
      budgetRange: budgetRangeVal,
      neighborhoodOfInterest: neighborhoodVal,
      desiredPropertyType: propertyTypeVal,
      temperature,
      nextAction: getValue("nextAction", "").trim(),
      createdAt: new Date().toISOString()
    };
  };

  const startImport = async () => {
    setImportStep("importing");
    setImportProgress(0);

    let success = 0;
    let failed = 0;
    const errors: { row: number; name: string; error: string }[] = [];

    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      const clientName = row[fieldMappings["name"]] || `Linha ${i + 2}`;

      // Check if required fields exist
      const nameVal = (row[fieldMappings["name"]] || "").trim();
      const phoneVal = (row[fieldMappings["phone"]] || "").trim();

      if (!nameVal || !phoneVal) {
        failed++;
        errors.push({
          row: i + 2,
          name: nameVal || "Nome não encontrado",
          error: "Campos obrigatórios ausentes: " + (!nameVal ? "Nome " : "") + (!phoneVal ? "Telefone" : "")
        });
        continue;
      }

      try {
        const mappedClient = getMappedClient(row);
        await onAddClient(mappedClient);
        success++;
      } catch (err: any) {
        failed++;
        errors.push({
          row: i + 2,
          name: nameVal,
          error: err?.message || "Erro desconhecido ao salvar contato."
        });
      }

      setImportProgress(Math.round(((i + 1) / csvRows.length) * 100));
    }

    setImportResults({
      success,
      failed,
      errors
    });
    setImportStep("success");
  };

  const resetImportState = () => {
    setCsvFile(null);
    setCsvFileName("");
    setCsvHeaders([]);
    setCsvRows([]);
    setFieldMappings({
      name: -1,
      phone: -1,
      email: -1,
      clientType: -1,
      document: -1,
      profileType: -1,
      status: -1,
      interest: -1,
      propertyType: -1,
      budgetRange: -1,
      neighborhoodOfInterest: -1,
      temperature: -1,
      observations: -1,
    });
    setImportProgress(0);
    setImportResults({ success: 0, failed: 0, errors: [] });
    setImportStep("upload");
  };

  // Form states for creating a new client
  const [clientType, setClientType] = useState<"PF" | "PJ">("PF");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const [profileType, setProfileType] = useState("Lead");
  const [objective, setObjective] = useState("Venda");
  const [propertyType, setPropertyType] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [observations, setObservations] = useState("");
  const [birthday, setBirthday] = useState("");
  const [address, setAddress] = useState("");

  // New real estate CRM fields
  const [leadSource, setLeadSource] = useState("Outro");
  const [interest, setInterest] = useState("Compra");
  const [budgetRange, setBudgetRange] = useState("");
  const [neighborhoodOfInterest, setNeighborhoodOfInterest] = useState("");
  const [desiredPropertyType, setDesiredPropertyType] = useState("");
  const [temperature, setTemperature] = useState<"Frio" | "Morno" | "Quente">("Morno");
  const [nextAction, setNextAction] = useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");

  useEffect(() => {
    if (showAddForm && currentUser?.primaryCity) {
      setAddress(currentUser.primaryCity);
    }
  }, [showAddForm, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !phone.trim()) {
      setFormError("Por favor, preencha o nome e o telefone do cliente.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newClient: Omit<Client, "id"> = {
        clientType,
        name: name.trim(),
        phone: phone.trim(),
        document: document.trim(),
        email: email.trim(),
        profileType,
        objective,
        propertyType: propertyType || "Qualquer",
        minBudget: Number(minBudget) || 0,
        maxBudget: Number(maxBudget) || 0,
        observations,
        birthday: birthday && birthday.trim() !== "" ? birthday : undefined,
        address: address && address.trim() !== "" ? address : undefined,
        status: "Novo",
        leadSource,
        interest,
        budgetRange,
        neighborhoodOfInterest,
        desiredPropertyType,
        temperature,
        nextAction,
        nextFollowUpDate: nextFollowUpDate && nextFollowUpDate.trim() !== "" ? nextFollowUpDate : undefined,
        createdAt: new Date().toISOString()
      };

      await onAddClient(newClient);
      
      // Reset form
      setClientType("PF");
      setName("");
      setPhone("");
      setDocument("");
      setEmail("");
      setPropertyType("");
      setMinBudget("");
      setMaxBudget("");
      setObservations("");
      setBirthday("");
      setAddress("");
      setLeadSource("Outro");
      setInterest("Compra");
      setBudgetRange("");
      setNeighborhoodOfInterest("");
      setDesiredPropertyType("");
      setTemperature("Morno");
      setNextAction("");
      setNextFollowUpDate("");
      setShowAddForm(false);
    } catch (err: any) {
      console.error("Failed to save client in ClientsView:", err);
      const errMessage = err?.message || "Ocorreu um erro no servidor ou parâmetros incorretos.";
      setFormError(`Falha ao salvar cliente: ${errMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get visual initials for user avatar
  const getInitials = (fullName: string) => {
    return (fullName || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";
  };

  // Filter clients list
  const filteredClients = clients.filter((c) => {
    let matchesFilter = filter === "Todos";
    if (filter === "Esfriando") {
      const alerts = getClientAlerts(c, tasks, proposals, visits);
      matchesFilter = alerts.length > 0;
    } else if (filter !== "Todos") {
      matchesFilter = c.profileType === filter;
    }
    
    const query = search.toLowerCase();
    const matchesSearch =
      (c.name || "").toLowerCase().includes(query) ||
      (c.phone || "").includes(query) ||
      (c.email || "").toLowerCase().includes(query) ||
      (c.observations || "").toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {!showAddForm ? (
        /* MAIN LISTING SCREEN */
        <>
          {/* Top Search & Filter Bar */}
          <div className="space-y-4">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
                <Search className="w-5 h-5 stroke-[2]" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone, e-mail ou observações..."
                className="w-full pl-12 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-body-lg text-sm text-on-surface"
              />
            </div>

            {/* Profile Type Filter Chips */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {["Todos", "Esfriando", "Lead", "Comprador", "Vendedor", "Locador", "Locatário", "Investidor"].map((tab) => {
                const isActive = filter === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`px-4 py-2 rounded-full border text-xs font-bold whitespace-nowrap transition-all shadow-sm cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? tab === "Esfriando" ? "bg-red-600 text-white border-red-600" : "bg-primary text-on-primary border-primary"
                        : tab === "Esfriando" ? "bg-red-50 border-red-200 text-red-800 hover:bg-red-100" : "bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {tab === "Esfriando" && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                    {tab}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Client List */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
              <span className="font-label-caps text-xs text-on-surface-variant tracking-wider font-bold">LEADS E CLIENTES CADASTRADOS</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-primary font-bold">{filteredClients.length} contatos</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-[#004d3e]/10 hover:bg-[#004d3e]/20 text-[#004d3e] border border-[#004d3e]/20 rounded-lg font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Importar contatos via arquivo CSV"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Importar CSV</span>
                  </button>
                  {clients.length > 0 && (
                    <>
                      <button
                        onClick={() => exportClientsToCSV(filteredClients, true)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 rounded-lg font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                        title="Exportar contatos filtrados para CSV"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Exportar CSV</span>
                      </button>
                      <button
                        onClick={() => exportClientsListToPDF(filteredClients)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-[#004d3e]/10 hover:bg-[#004d3e]/20 text-[#004d3e] border border-[#004d3e]/20 rounded-lg font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                        title="Exportar contatos filtrados para PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Exportar PDF</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {filteredClients.map((c, idx) => {
                const clientAlerts = getClientAlerts(c, tasks, proposals, visits);
                return (
                  <div
                    key={c.id || c._id || `client-${idx}`}
                    onClick={() => onSelectClient(c)}
                    className="bg-surface-container-lowest p-4 rounded-xl flex items-center gap-4 border border-outline-variant/20 shadow-sm hover:shadow-md transition-all active:scale-[0.99] cursor-pointer group relative overflow-hidden"
                  >
                    {clientAlerts.length > 0 && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                    )}

                    <div className="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-display text-title-md font-bold shadow-inner shrink-0">
                      {getInitials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-display text-sm font-bold text-on-surface group-hover:text-primary transition-colors truncate flex items-center gap-1.5">
                          {c.name}
                          {c.clientType === "PJ" ? (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 text-[9px] font-bold rounded">PJ</span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 text-[9px] font-bold rounded">PF</span>
                          )}
                        </h4>
                        <span className="text-[10px] text-on-surface-variant font-mono whitespace-nowrap shrink-0">
                          {new Date(c.createdAt || "").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-on-surface-variant font-semibold mt-1">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-secondary" />
                          {c.phone}
                        </span>
                      </div>

                      <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5 mt-2 font-medium">
                        <span className="w-2 h-2 rounded-full bg-secondary"></span>
                        {c.profileType} • {c.objective} ({c.propertyType})
                      </p>

                      {/* Render client-specific commercial routine alerts */}
                      {clientAlerts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {clientAlerts.map(alert => {
                            const badgeStyles = getAlertBadgeStyles(alert.level);
                            return (
                              <span 
                                key={alert.id} 
                                className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md flex items-center gap-1 border border-current ${badgeStyles.bg}`}
                                title={alert.description}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 animate-pulse"></span>
                                {alert.title} ({alert.level})
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* PDF Export Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportClientReportToPDF(c, proposals, visits);
                      }}
                      className="p-2.5 bg-surface-container-high hover:bg-surface-container-highest hover:text-primary text-on-surface-variant border border-outline-variant/30 rounded-lg font-bold transition-all cursor-pointer shadow-sm active:scale-95 flex-shrink-0 flex items-center justify-center gap-1.5 self-center group/btn"
                      title="Exportar Relatório PDF"
                    >
                      <Download className="w-4 h-4 text-primary group-hover/btn:scale-115 transition-transform" />
                      <span className="hidden sm:inline text-[11px]">Relatório PDF</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Empty fallback */}
          {filteredClients.length === 0 && (
            clients.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-20 px-6 text-on-surface-variant bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/60 shadow-sm animate-in fade-in duration-300 max-w-2xl mx-auto my-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-5 shadow-inner">
                  <UserPlus className="w-8 h-8 stroke-[1.5]" />
                </div>
                <h3 className="font-display text-xl font-bold text-on-surface tracking-tight">
                  Não perca mais nenhuma oportunidade de venda!
                </h3>
                <p className="text-sm opacity-90 mt-2.5 max-w-md leading-relaxed">
                  O Metria CRM garante que você não perca mais leads, visitas, propostas e follow-ups. Cadastre sua primeira oportunidade agora e mantenha todo o seu funil de negócios sob controle absoluto.
                </p>
                <div className="flex flex-wrap justify-center gap-3 mt-6">
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-6 py-3 bg-primary hover:bg-primary/95 text-on-primary font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 hover:shadow-lg cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    Cadastrar lead
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="px-6 py-3 bg-white hover:bg-surface-container text-primary rounded-xl border border-outline-variant font-bold text-sm transition-all shadow-sm active:scale-95 flex items-center gap-2 hover:shadow-md cursor-pointer"
                  >
                    <Upload className="w-4 h-4 stroke-[2.5]" />
                    Importar CSV
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-on-surface-variant bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/40 shadow-sm animate-in fade-in duration-200">
                <div className="w-12 h-12 rounded-full bg-on-surface-variant/10 text-on-surface-variant flex items-center justify-center mb-4">
                  <Search className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h3 className="font-display text-base font-bold text-on-surface">
                  Nenhum lead ou cliente encontrado
                </h3>
                <p className="text-xs opacity-80 mt-1 max-w-sm leading-relaxed">
                  Não encontramos correspondência para os filtros ou busca atual. Tente alterar os termos ou limpe a seleção.
                </p>
                <div className="flex gap-2.5 mt-5">
                  <button
                    onClick={() => {
                      setSearch("");
                      setFilter("Todos");
                    }}
                    className="px-4 py-2 bg-white hover:bg-surface-container text-primary border border-outline-variant rounded-lg text-xs font-bold transition-all active:scale-[0.97] cursor-pointer shadow-sm"
                  >
                    Limpar filtros
                  </button>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-primary hover:bg-primary/95 text-on-primary rounded-lg text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    Novo lead
                  </button>
                </div>
              </div>
            )
          )}

          {/* Floating Action Button for adding client */}
          <button
            onClick={() => setShowAddForm(true)}
            className="fixed right-6 bottom-24 w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40 cursor-pointer border border-primary-container/20"
          >
            <UserPlus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </>
      ) : (
        /* NOVO CLIENTE FORM SCREEN */
        <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/30 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <header className="flex justify-between items-center pb-4 border-b border-outline-variant mb-6">
            <h2 className="font-display text-headline-lg-mobile text-primary">Cadastrar Novo Cliente</h2>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6 text-sm text-left">
            {formError && (
              <div className="p-3.5 bg-error/10 text-error border border-error/20 rounded-xl flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs">Atenção</p>
                  <p className="text-xs">{formError}</p>
                </div>
              </div>
            )}
            {/* Section 1: Personal Info */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                1. Informações do Cliente
              </h3>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface-variant">Tipo de Cliente</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-surface-container-high rounded-lg border border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setClientType("PF")}
                    className={`h-9 rounded-md font-bold text-xs transition-all ${
                      clientType === "PF"
                        ? "bg-white text-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-white/50"
                    }`}
                  >
                    Pessoa Física (PF)
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientType("PJ")}
                    className={`h-9 rounded-md font-bold text-xs transition-all ${
                      clientType === "PJ"
                        ? "bg-white text-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-white/50"
                    }`}
                  >
                    Pessoa Jurídica (PJ)
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">
                  {clientType === "PJ" ? "Razão Social / Nome Fantasia" : "Nome Completo"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={clientType === "PJ" ? "Ex: Minha Empresa LTDA" : "Ex: João da Silva"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Telefone</label>
                  <input
                    type="tel"
                    required
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">
                    {clientType === "PJ" ? "CNPJ" : "CPF"}
                  </label>
                  <input
                    type="text"
                    placeholder={clientType === "PJ" ? "00.000.000/0001-00" : "000.000.000-00"}
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">E-mail</label>
                  <input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Data de Aniversário</label>
                  <input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Endereço Completo</label>
                <input
                  type="text"
                  placeholder="Ex: Av. Atlântica, 1200 - Copacabana, Rio de Janeiro - RJ"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                />
              </div>
            </div>

            {/* Section 2: Profile Type Selection */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                2. Tipo de Perfil
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {["Lead", "Comprador", "Vendedor", "Locador", "Locatário", "Investidor"].map((item) => {
                  const isActive = profileType === item;
                  return (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setProfileType(item)}
                      className={`py-3 rounded-lg border text-center font-bold text-xs cursor-pointer transition-all ${
                        isActive
                          ? "bg-secondary-container/25 border-secondary text-secondary"
                          : "bg-white border-outline-variant text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Preferences & Interest */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                3. Interesse Imobiliário e Qualificação de Lead
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Objetivo de Interesse</label>
                  <select
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm outline-none"
                  >
                    <option value="Compra">Compra</option>
                    <option value="Venda">Venda</option>
                    <option value="Locação">Locação</option>
                    <option value="Avaliação">Avaliação</option>
                    <option value="Investimento">Investimento</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Tipo de Imóvel Desejado</label>
                  <input
                    type="text"
                    value={desiredPropertyType}
                    onChange={(e) => setDesiredPropertyType(e.target.value)}
                    placeholder="Ex: Apartamento, Casa de Condomínio"
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Bairro de Interesse</label>
                  <input
                    type="text"
                    value={neighborhoodOfInterest}
                    onChange={(e) => setNeighborhoodOfInterest(e.target.value)}
                    placeholder="Ex: Copacabana, Ipanema"
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Faixa de Orçamento</label>
                  <input
                    type="text"
                    value={budgetRange}
                    onChange={(e) => setBudgetRange(e.target.value)}
                    placeholder="Ex: R$ 500k - R$ 800k"
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Origem do Lead</label>
                  <select
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm outline-none"
                  >
                    {(currentUser?.leadSources && currentUser.leadSources.length > 0
                      ? currentUser.leadSources
                      : [
                          "Indicação",
                          "Instagram",
                          "Facebook",
                          "OLX",
                          "Portal Imobiliário",
                          "Placa",
                          "WhatsApp",
                          "Tráfego Pago",
                          "Outro"
                        ]
                    ).map((src) => (
                      <option key={src} value={src}>{src}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Temperatura do Lead</label>
                  <select
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value as any)}
                    className="h-11 px-3 border border-outline-variant bg-white rounded-lg text-sm outline-none"
                  >
                    <option value="Frio">Frio</option>
                    <option value="Morno">Morno</option>
                    <option value="Quente">Quente</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Próxima Ação Planejada</label>
                  <input
                    type="text"
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder="Ex: Enviar opções do Jardim Oceânico"
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Data do Próximo Follow-up</label>
                  <input
                    type="date"
                    value={nextFollowUpDate}
                    onChange={(e) => setNextFollowUpDate(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-secondary"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Observations */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                4. Observações e Perfil
              </h3>

              <textarea
                rows={4}
                placeholder="Anotações e detalhes adicionais sobre o perfil do cliente, preferências de bairros, se precisa de financiamento, horários de contato preferidos..."
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="w-full p-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm resize-none"
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t border-outline-variant">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-5 py-3 bg-surface-container-high text-on-surface-variant rounded-xl font-bold font-label-md"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold font-label-md shadow-md hover:opacity-95 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando Cliente...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Cliente
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant/30 w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/40 shrink-0">
              <div>
                <h2 className="font-display text-lg font-bold text-on-surface">Importar Contatos via CSV</h2>
                <p className="text-xs text-on-surface-variant/80 mt-0.5">Importe múltiplos clientes de uma só vez mapeando as colunas do seu arquivo.</p>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  resetImportState();
                }}
                className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Wizard Track */}
            <div className="bg-surface-container-low px-6 py-3 border-b border-outline-variant/20 flex justify-between text-xs font-semibold text-on-surface-variant/70 shrink-0">
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${importStep === "upload" ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant"}`}>1</span>
                <span className={importStep === "upload" ? "text-primary font-bold" : ""}>Carregar Arquivo</span>
              </div>
              <div className="h-px bg-outline-variant/30 flex-1 mx-4 align-middle my-auto"></div>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${importStep === "map" ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant"}`}>2</span>
                <span className={importStep === "map" ? "text-primary font-bold" : ""}>Mapear Colunas</span>
              </div>
              <div className="h-px bg-outline-variant/30 flex-1 mx-4 align-middle my-auto"></div>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${importStep === "preview" ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant"}`}>3</span>
                <span className={importStep === "preview" ? "text-primary font-bold" : ""}>Visualizar</span>
              </div>
            </div>

            {/* Modal Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Step 1: Upload */}
              {importStep === "upload" && (
                <div className="space-y-6">
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => window.document.getElementById("csv-upload-input")?.click()}
                    className="border-2 border-dashed border-outline-variant hover:border-primary/60 bg-surface-container-low hover:bg-surface-container/40 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                  >
                    <input
                      type="file"
                      id="csv-upload-input"
                      accept=".csv"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform shadow-inner">
                      <Upload className="w-8 h-8 stroke-[1.5]" />
                    </div>
                    <h3 className="font-display text-base font-bold text-on-surface">Arraste e solte o arquivo CSV aqui</h3>
                    <p className="text-xs text-on-surface-variant/80 mt-1.5 max-w-sm">Ou clique para navegar em seu computador. O arquivo deve conter uma linha de cabeçalho.</p>
                    <span className="mt-4 text-[10px] bg-primary/10 text-primary font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">Selecionar Arquivo .CSV</span>
                  </div>

                  <div className="bg-surface-container-low border border-outline-variant/40 rounded-xl p-4 space-y-2.5 text-xs text-on-surface-variant/90 leading-relaxed">
                    <h4 className="font-bold text-on-surface flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-secondary" />
                      Dicas para uma importação perfeita:
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-on-surface-variant/80">
                      <li>Certifique-se de que a primeira linha do arquivo contenha os nomes das colunas (Ex: Nome, Telefone, E-mail, etc.).</li>
                      <li>Os campos <strong>Nome</strong> e <strong>Telefone</strong> são obrigatórios para concluir o cadastro do cliente.</li>
                      <li>O sistema é inteligente e tentará mapear as colunas automaticamente baseado em sinônimos comuns.</li>
                      <li>Formatos recomendados para separador: vírgula (<code>,</code>) ou ponto e vírgula (<code>;</code>).</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Step 2: Map Columns */}
              {importStep === "map" && (
                <div className="space-y-6">
                  <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-primary">
                    <span className="font-medium">Arquivo carregado: <strong>{csvFileName}</strong></span>
                    <span className="font-bold">{csvRows.length} linhas de contatos encontradas</span>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-outline-variant/40">
                      <h3 className="font-display text-sm font-bold text-on-surface">Mapeamento de Campos</h3>
                      <span className="text-[10px] text-on-surface-variant/70">Associe as colunas do seu CSV aos campos do CRM</span>
                    </div>

                    <div className="space-y-3.5 max-w-2xl mx-auto">
                      {SCHEMA_FIELDS.map((field) => {
                        const currentMappedIdx = fieldMappings[field.key];
                        const isAutoMapped = currentMappedIdx !== -1;
                        
                        return (
                          <div key={field.key} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center bg-surface-container-low border border-outline-variant/30 hover:border-outline-variant/70 p-3.5 rounded-xl transition-colors">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-on-surface">{field.label}</span>
                              {field.required && <span className="text-red-500 font-bold" title="Obrigatório">*</span>}
                              {isAutoMapped && (
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-600 font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider scale-90">Auto</span>
                              )}
                            </div>
                            <div className="flex items-center">
                              <select
                                value={currentMappedIdx}
                                onChange={(e) => setFieldMappings({
                                  ...fieldMappings,
                                  [field.key]: Number(e.target.value)
                                })}
                                className="w-full h-9 text-xs px-2.5 border border-outline-variant/70 bg-white rounded-lg focus:border-primary outline-none"
                              >
                                <option value={-1}>— Não importar (ignorar campo) —</option>
                                {csvHeaders.map((header, idx) => (
                                  <option key={idx} value={idx}>
                                    Coluna {idx + 1}: {header}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mapping validation feedback */}
                  {(fieldMappings["name"] === -1 || fieldMappings["phone"] === -1) && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-xs p-3.5 rounded-xl flex items-center gap-2 font-medium">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Por favor, mapeie as colunas de <strong>Nome</strong> e <strong>Telefone</strong> para habilitar a importação de contatos.</span>
                    </div>
                  )}

                  <div className="flex justify-between pt-4 border-t border-outline-variant/40 shrink-0">
                    <button
                      onClick={() => setImportStep("upload")}
                      className="px-5 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant font-bold text-xs rounded-xl transition-all"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={() => setImportStep("preview")}
                      disabled={fieldMappings["name"] === -1 || fieldMappings["phone"] === -1}
                      className="px-5 py-2.5 bg-primary hover:bg-primary/95 text-on-primary font-bold text-xs rounded-xl disabled:opacity-50 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      Avançar para Pré-visualização
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Preview */}
              {importStep === "preview" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-display text-sm font-bold text-on-surface mb-1">Pré-visualização dos Dados</h3>
                    <p className="text-xs text-on-surface-variant/80">Confira abaixo como ficarão os primeiros 3 contatos importados em seu Metria CRM.</p>
                  </div>

                  <div className="space-y-3.5 overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-surface-container-high border-b border-outline-variant/40 text-on-surface-variant font-bold">
                          <th className="p-3">Nome</th>
                          <th className="p-3">Telefone</th>
                          <th className="p-3">E-mail</th>
                          <th className="p-3">Tipo</th>
                          <th className="p-3">Interesse</th>
                          <th className="p-3">Temperatura</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20">
                        {csvRows.slice(0, 3).map((row, idx) => {
                          const previewClient = getMappedClient(row);
                          return (
                            <tr key={idx} className="hover:bg-surface-container-low">
                              <td className="p-3 font-semibold text-on-surface">{previewClient.name || <span className="text-red-500 italic">Ausente</span>}</td>
                              <td className="p-3 text-on-surface-variant">{previewClient.phone || <span className="text-red-500 italic">Ausente</span>}</td>
                              <td className="p-3 text-on-surface-variant/80">{previewClient.email || "—"}</td>
                              <td className="p-3 text-on-surface-variant/80">{previewClient.clientType}</td>
                              <td className="p-3 text-on-surface-variant/80">{previewClient.interest || "—"}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  previewClient.temperature === "Quente" ? "bg-red-100 text-red-800" :
                                  previewClient.temperature === "Morno" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                                }`}>
                                  {previewClient.temperature}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {csvRows.length > 3 && (
                      <p className="text-[11px] text-on-surface-variant/60 text-center italic mt-2">... e mais {csvRows.length - 3} contatos serão importados.</p>
                    )}
                  </div>

                  <div className="flex justify-between pt-4 border-t border-outline-variant/40 shrink-0">
                    <button
                      onClick={() => setImportStep("map")}
                      className="px-5 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant font-bold text-xs rounded-xl transition-all"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={startImport}
                      className="px-6 py-2.5 bg-primary hover:bg-primary/95 text-on-primary font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      Confirmar e Importar {csvRows.length} Contatos
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Importing */}
              {importStep === "importing" && (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <h3 className="font-display text-base font-bold text-on-surface">Importando seus contatos...</h3>
                  <p className="text-xs text-on-surface-variant/80 max-w-xs leading-relaxed">Por favor, não feche esta janela ou mude de aba. Estamos salvando os contatos de forma segura no Metria CRM.</p>
                  
                  <div className="w-full max-w-md bg-surface-container rounded-full h-3.5 mt-4 overflow-hidden border border-outline-variant/20 shadow-inner">
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-primary">{importProgress}% Concluído</span>
                </div>
              )}

              {/* Step 5: Success & Summary */}
              {importStep === "success" && (
                <div className="space-y-6">
                  <div className="flex flex-col items-center justify-center text-center py-6">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 shadow-sm">
                      <CheckCircle2 className="w-9 h-9 stroke-[1.8]" />
                    </div>
                    <h3 className="font-display text-lg font-bold text-on-surface">Importação Concluída!</h3>
                    <p className="text-xs text-on-surface-variant/80 mt-1 max-w-sm">Processamos todas as linhas de contatos do seu arquivo CSV com sucesso.</p>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-center">
                      <span className="block text-2xl font-black text-emerald-600">{importResults.success}</span>
                      <span className="text-[11px] font-bold text-emerald-700/80 uppercase tracking-wider">Sucesso</span>
                    </div>
                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-center">
                      <span className="block text-2xl font-black text-red-600">{importResults.failed}</span>
                      <span className="text-[11px] font-bold text-red-700/80 uppercase tracking-wider">Falhas</span>
                    </div>
                  </div>

                  {/* Error Logs */}
                  {importResults.errors.length > 0 && (
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        Relatório de Erros ({importResults.errors.length})
                      </h4>
                      <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5 font-mono text-[10px] text-on-surface-variant/90">
                        {importResults.errors.map((err, idx) => (
                          <div key={idx} className="py-1 border-b border-outline-variant/10 last:border-0 flex justify-between gap-4">
                            <span><strong className="text-red-500">Linha {err.row}:</strong> {err.name}</span>
                            <span className="text-red-600 font-semibold">{err.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-center pt-4 border-t border-outline-variant/40 shrink-0">
                    <button
                      onClick={() => {
                        setShowImportModal(false);
                        resetImportState();
                      }}
                      className="px-8 py-3 bg-primary hover:bg-primary/95 text-on-primary font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      Entendido, Fechar Relatório
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
