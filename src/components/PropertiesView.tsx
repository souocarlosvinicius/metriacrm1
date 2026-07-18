import React, { useState, useEffect } from "react";
import { Property, User, Client } from "../types";
import { Search, Home, Plus, Bed, Square, Shield, X, Check, Save, Loader2, DollarSign, Bath, Car, Upload, Video, Film, Trash, Image as ImageIcon, Star, Download } from "lucide-react";
import { exportPropertiesToCSV } from "../utils/csvExport";
import { exportPropertiesListToPDF } from "../utils/pdfExport";
import { apiFetch } from "../api";

interface PropertiesViewProps {
  properties: Property[];
  clients: Client[];
  onAddProperty: (prop: Omit<Property, "id">) => Promise<void>;
  onSelectProperty: (prop: Property) => void;
  currentUser?: User | null;
}

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 750;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          resolve(dataUrl);
        } else {
          resolve(event.target?.result as string);
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function PropertiesView({ properties, clients, onAddProperty, onSelectProperty, currentUser }: PropertiesViewProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [selectedType, setSelectedType] = useState("Todos");
  const [selectedPriceRange, setSelectedPriceRange] = useState("Todos");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset price range filter when modality changes to avoid mismatched ranges
  useEffect(() => {
    setSelectedPriceRange("Todos");
  }, [filter]);

  // Form states for creating a new property
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Apartamento");
  const [condition, setCondition] = useState("Novo");
  const [description, setDescription] = useState("");
  const [modality, setModality] = useState("Venda");
  const [price, setPrice] = useState("");
  const [condo, setCondo] = useState("");
  const [iptu, setIptu] = useState("");
  const [address, setAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("São Paulo / SP");
  const [bedrooms, setBedrooms] = useState(2);
  const [suites, setSuites] = useState(1);
  const [bathrooms, setBathrooms] = useState(2);
  const [parkingSpots, setParkingSpots] = useState(1);
  const [area, setArea] = useState("");
  const [builtArea, setBuiltArea] = useState("");
  const [constructionYear, setConstructionYear] = useState("");
  const [floor, setFloor] = useState("");
  const [sunPosition, setSunPosition] = useState("");
  const [documentStatus, setDocumentStatus] = useState("");
  const [financialStatus, setFinancialStatus] = useState("não definida");
  const [acceptsExchange, setAcceptsExchange] = useState(false);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [customPhotoUrl, setCustomPhotoUrl] = useState("");
  const [selectedPresetPhoto, setSelectedPresetPhoto] = useState(0);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [videoLink, setVideoLink] = useState("");
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [ownerId, setOwnerId] = useState("");

  useEffect(() => {
    if (showAddForm && currentUser?.primaryCity) {
      setCity(currentUser.primaryCity);
    }
  }, [showAddForm, currentUser]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = 8 - uploadedPhotos.length;
    if (remainingSlots <= 0) {
      alert("Você já adicionou o limite máximo de 8 fotos.");
      return;
    }

    const filesArray = Array.from(files).slice(0, remainingSlots);
    if (filesArray.length < files.length) {
      alert(`Você só pode adicionar até 8 fotos no total. Apenas as primeiras ${remainingSlots} fotos selecionadas serão carregadas.`);
    }

    setIsUploadingPhotos(true);
    try {
      const compressedPromises = filesArray.map(file => compressImage(file as File));
      const base64Results = await Promise.all(compressedPromises);
      
      const uploadPromises = base64Results.map(async (dataUrl) => {
        const response = await apiFetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ dataUrl })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Erro no upload.");
        }
        const data = await response.json();
        return data.url;
      });

      const serverUrls = await Promise.all(uploadPromises);
      setUploadedPhotos(prev => [...prev, ...serverUrls]);
    } catch (err: any) {
      console.error("Erro ao carregar fotos:", err);
      alert(`Houve um erro ao processar as fotos selecionadas: ${err.message || err}`);
    } finally {
      setIsUploadingPhotos(false);
      if (e.target) e.target.value = "";
    }
  };

  // Captador fields
  const [captadorName, setCaptadorName] = useState(currentUser?.name || "");
  const [captadorPhone, setCaptadorPhone] = useState(currentUser?.phone || "");
  const [estimatedCommission, setEstimatedCommission] = useState("");

  // Sync with current logged-in user when form opens
  useEffect(() => {
    if (currentUser) {
      setCaptadorName(currentUser.name || "");
      setCaptadorPhone(currentUser.phone || "");
    }
  }, [currentUser, showAddForm]);

  // Preset Unsplash Architectural Images
  const presetPhotos = [
    "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80"
  ];

  const amenitiesList = [
    "Piscina",
    "Academia",
    "Churrasqueira",
    "Playground",
    "Salão de Festas",
    "Portaria 24h"
  ];

  const handleAmenityToggle = (amenity: string) => {
    setAmenities(prev =>
      prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      alert("Por favor, preencha o título do anúncio.");
      return;
    }

    setIsSubmitting(true);
    try {
      const finalPhotos = uploadedPhotos.length > 0
        ? uploadedPhotos
        : (customPhotoUrl ? [customPhotoUrl] : [presetPhotos[selectedPresetPhoto]]);
      
      const newProp: Omit<Property, "id"> = {
        title,
        type,
        condition,
        description,
        modality,
        price: Number(price) || 0,
        condo: Number(condo) || 0,
        iptu: Number(iptu) || 0,
        address,
        neighborhood,
        city,
        bedrooms: Number(bedrooms),
        suites: Number(suites),
        bathrooms: Number(bathrooms),
        parkingSpots: Number(parkingSpots),
        area: Number(area) || 0,
        builtArea: Number(builtArea) || 0,
        constructionYear: constructionYear ? Number(constructionYear) : undefined,
        floor: floor || undefined,
        sunPosition: sunPosition || undefined,
        documentStatus: documentStatus || undefined,
        financialStatus: financialStatus || undefined,
        acceptsExchange: acceptsExchange,
        photos: finalPhotos,
        videoLink: videoLink || undefined,
        amenities,
        status: "DISPONÍVEL",
        captadorName: captadorName || currentUser?.name || "Carlos Eduardo",
        captadorPhone: captadorPhone || currentUser?.phone || "(11) 98765-4321",
        estimatedCommission: estimatedCommission ? Number(estimatedCommission) : undefined,
        ownerId: ownerId || undefined,
        createdAt: new Date().toISOString()
      };

      await onAddProperty(newProp);
      
      // Reset form
      setTitle("");
      setDescription("");
      setPrice("");
      setCondo("");
      setIptu("");
      setAddress("");
      setNeighborhood("");
      setArea("");
      setBuiltArea("");
      setEstimatedCommission("");
      setConstructionYear("");
      setFloor("");
      setSunPosition("");
      setDocumentStatus("");
      setFinancialStatus("não definida");
      setAcceptsExchange(false);
      setAmenities([]);
      setCustomPhotoUrl("");
      setUploadedPhotos([]);
      setVideoLink("");
      setOwnerId("");
      setShowAddForm(false);
    } catch (err) {
      console.error(err);
      alert("Falha ao salvar imóvel.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter properties
  const filteredProperties = properties.filter((p) => {
    const matchesModality = filter === "Todos" || p.modality === filter;
    
    const matchesType = selectedType === "Todos" || (p.type && p.type.toLowerCase() === selectedType.toLowerCase());

    const matchesPriceRange = (() => {
      if (selectedPriceRange === "Todos") return true;
      const price = p.price ?? 0;
      
      if (filter === "Aluguel" || filter === "Temporada") {
        switch (selectedPriceRange) {
          case "Até R$ 2.000":
            return price <= 2000;
          case "R$ 2.000 - R$ 5.000":
            return price >= 2000 && price <= 5000;
          case "R$ 5.000 - R$ 10.000":
            return price >= 5000 && price <= 10000;
          case "Acima de R$ 10.000":
            return price > 10000;
          default:
            return true;
        }
      } else {
        switch (selectedPriceRange) {
          case "Até R$ 300k":
            return price <= 300000;
          case "R$ 300k - R$ 750k":
            return price >= 300000 && price <= 750000;
          case "R$ 750k - R$ 1.5M":
            return price >= 750000 && price <= 1500000;
          case "R$ 1.5M - R$ 4M":
            return price >= 1500000 && price <= 4000000;
          case "Acima de R$ 4M":
            return price > 4000000;
          default:
            return true;
        }
      }
    })();

    const query = search.toLowerCase();
    const matchesSearch =
      (p.title || "").toLowerCase().includes(query) ||
      (p.neighborhood || "").toLowerCase().includes(query) ||
      (p.city || "").toLowerCase().includes(query) ||
      (p.type || "").toLowerCase().includes(query);

    return matchesModality && matchesType && matchesPriceRange && matchesSearch;
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
                placeholder="Buscar por bairro, condomínio, código ou características..."
                className="w-full pl-12 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-body-lg text-sm text-on-surface"
              />
            </div>

            {/* Quick Filters Group */}
            <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-4.5 space-y-4 shadow-xs">
              {/* Modality Filter Chips */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Finalidade</span>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {["Todos", "Venda", "Aluguel", "Temporada"].map((tab) => {
                    const isActive = filter === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setFilter(tab)}
                        className={`px-3.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-all shadow-xs cursor-pointer ${
                          isActive
                            ? "bg-primary text-on-primary border-primary"
                            : "bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container"
                        }`}
                      >
                        {tab}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Type Filter Chips (Prominent: Chácara, Sítio, Fazenda, Galpão) */}
              <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/30">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Tipo de Imóvel</span>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {["Todos", "Chácara", "Sítio", "Fazenda", "Galpão", "Apartamento", "Casa", "Sobrado", "Terreno", "Comercial"].map((t) => {
                    const isActive = selectedType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedType(t)}
                        className={`px-3.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-all shadow-xs cursor-pointer ${
                          isActive
                            ? "bg-secondary text-on-secondary border-secondary font-extrabold"
                            : "bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Price Range Filter Chips */}
              <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/30">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Faixa de Preço</span>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {(filter === "Aluguel" || filter === "Temporada"
                    ? ["Todos", "Até R$ 2.000", "R$ 2.000 - R$ 5.000", "R$ 5.000 - R$ 10.000", "Acima de R$ 10.000"]
                    : ["Todos", "Até R$ 300k", "R$ 300k - R$ 750k", "R$ 750k - R$ 1.5M", "R$ 1.5M - R$ 4M", "Acima de R$ 4M"]
                  ).map((range) => {
                    const isActive = selectedPriceRange === range;
                    return (
                      <button
                        key={range}
                        type="button"
                        onClick={() => setSelectedPriceRange(range)}
                        className={`px-3.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-all shadow-xs cursor-pointer ${
                          isActive
                            ? "bg-primary-container text-primary border-primary-container font-extrabold"
                            : "bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container"
                        }`}
                      >
                        {range}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Properties Count & Export */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
            <span className="font-label-caps text-xs text-on-surface-variant tracking-wider font-bold">IMÓVEIS NA CARTEIRA</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-primary font-bold">{filteredProperties.length} imóveis</span>
              {properties.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => exportPropertiesToCSV(filteredProperties, true)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 rounded-lg font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Exportar imóveis filtrados para CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar CSV</span>
                  </button>
                  <button
                    onClick={() => exportPropertiesListToPDF(filteredProperties)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-[#004d3e]/10 hover:bg-[#004d3e]/20 text-[#004d3e] border border-[#004d3e]/20 rounded-lg font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Exportar imóveis filtrados para PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar PDF</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Grid Layout of Property Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredProperties.map((p, idx) => (
              <div
                key={p.id || p._id || `property-${idx}`}
                onClick={() => onSelectProperty(p)}
                className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/30 shadow-sm hover:shadow-md transition-all active:scale-[0.99] cursor-pointer group flex flex-col justify-between"
              >
                <div className="relative h-48 w-full overflow-hidden bg-surface-container-high">
                  <img
                    src={p.photos?.[0] || presetPhotos[0]}
                    alt={p.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className={`px-2.5 py-1 rounded-md font-label-caps text-[10px] font-bold text-white tracking-wider shadow-sm ${
                      p.modality === "Venda" 
                        ? "bg-primary" 
                        : p.modality === "Aluguel"
                        ? "bg-secondary"
                        : "bg-tertiary-container text-on-tertiary-container"
                    }`}>
                      {p.modality === "Temporada" ? "TEMPORADA" : (p.modality || "").toUpperCase()}
                    </span>
                    <span className={`px-2.5 py-1 rounded-md font-label-caps text-[10px] font-bold shadow-sm ${
                      p.status === "DISPONÍVEL"
                        ? "bg-emerald-500 text-white"
                        : "bg-amber-500 text-white"
                    }`}>
                      {p.status}
                    </span>
                  </div>
                  {p.code && (
                    <div className="absolute bottom-3 right-3 bg-black/75 text-white px-2 py-0.5 rounded text-[10px] font-mono tracking-wider font-bold backdrop-blur-sm shadow-sm border border-white/10">
                      {p.code}
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="font-display text-title-md text-on-surface leading-tight font-bold group-hover:text-primary transition-colors">
                        {p.title}
                      </h3>
                      <p className="text-xs text-on-surface-variant font-medium mt-1">
                        {p.neighborhood}, {p.city}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-body-lg text-primary font-bold whitespace-nowrap">
                        R$ {(p.price ?? 0).toLocaleString("pt-BR")}
                        {p.modality !== "Venda" && <span className="text-xs font-normal">/mês</span>}
                      </p>
                    </div>
                  </div>

                  {/* Specifications inside cards */}
                  <div className="grid grid-cols-2 gap-y-2 gap-x-2.5 text-on-surface-variant text-xs pt-3 border-t border-outline-variant/30 font-medium">
                    <span className="flex items-center gap-1.5 min-w-0" title={`${p.bedrooms} Quartos`}>
                      <Bed className="w-4 h-4 text-secondary shrink-0 stroke-[1.5]" />
                      <span className="truncate">{p.bedrooms} {p.bedrooms === 1 ? 'Quarto' : 'Quartos'}</span>
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0" title={`${p.bathrooms || 0} Banheiros`}>
                      <Bath className="w-4 h-4 text-secondary shrink-0 stroke-[1.5]" />
                      <span className="truncate">{p.bathrooms || 0} {p.bathrooms === 1 ? 'Banheiro' : 'Banheiros'}</span>
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0 col-span-2" title={`${p.parkingSpots || 0} Vagas`}>
                      <Car className="w-4 h-4 text-secondary shrink-0 stroke-[1.5]" />
                      <span className="truncate">{p.parkingSpots || 0} {p.parkingSpots === 1 ? 'Vaga de garagem' : 'Vagas de garagem'}</span>
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0" title={`Metragem Total: ${p.area} m²`}>
                      <Square className="w-4 h-4 text-secondary shrink-0 stroke-[1.5]" />
                      <span className="truncate">Total: {p.area} m²</span>
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0" title={`Metragem Construída: ${p.builtArea || 0} m²`}>
                      <Home className="w-4 h-4 text-secondary shrink-0 stroke-[1.5]" />
                      <span className="truncate">Const.: {p.builtArea || 0} m²</span>
                    </span>
                  </div>

                  {/* Captador info inside card */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30 text-xs text-on-surface-variant font-medium">
                    <span className="truncate max-w-[55%]">
                      <span className="font-semibold text-emerald-800">Captador:</span> {p.captadorName || "Sem Captador"}
                    </span>
                    {p.captadorPhone && (
                      <a
                        href={`https://wa.me/55${p.captadorPhone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation(); // prevent opening details modal
                        }}
                        className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline whitespace-nowrap flex items-center gap-1 bg-emerald-100/40 border border-emerald-200/50 px-2 py-0.5 rounded transition-all"
                      >
                        {p.captadorPhone}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Empty fallback */}
          {filteredProperties.length === 0 && (
            properties.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-20 px-6 text-on-surface-variant bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/60 shadow-sm animate-in fade-in duration-300 max-w-2xl mx-auto my-4 col-span-full">
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-5 shadow-inner">
                  <Home className="w-8 h-8 stroke-[1.5]" />
                </div>
                <h3 className="font-display text-xl font-bold text-on-surface tracking-tight">
                  Sua carteira de imóveis ainda está vazia.
                </h3>
                <p className="text-sm opacity-90 mt-2.5 max-w-md leading-relaxed">
                  Cadastre suas propriedades para cruzá-las inteligentemente com o perfil de interesse dos seus leads e transformar follow-ups diários em negociações e fechamentos de sucesso.
                </p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="mt-6 px-6 py-3 bg-primary hover:bg-primary/95 text-on-primary font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 hover:shadow-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  Cadastrar imóvel
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-on-surface-variant bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/40 shadow-sm animate-in fade-in duration-200 col-span-full">
                <div className="w-12 h-12 rounded-full bg-on-surface-variant/10 text-on-surface-variant flex items-center justify-center mb-4">
                  <Search className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h3 className="font-display text-base font-bold text-on-surface">
                  Nenhum imóvel encontrado
                </h3>
                <p className="text-xs opacity-80 mt-1 max-w-sm leading-relaxed">
                  Nenhum imóvel atende aos filtros atuais de busca ou modalidade. Tente alterar os termos ou limpe a seleção.
                </p>
                <div className="flex gap-2.5 mt-5">
                  <button
                    onClick={() => {
                      setSearch("");
                      setFilter("Todos");
                      setSelectedType("Todos");
                      setSelectedPriceRange("Todos");
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
                    Novo imóvel
                  </button>
                </div>
              </div>
            )
          )}

          {/* Floating Action Button for adding */}
          <button
            onClick={() => setShowAddForm(true)}
            className="fixed right-6 bottom-24 w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40 cursor-pointer border border-primary-container/20"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </button>
        </>
      ) : (
        /* CADASTRO FORM VIEW */
        <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/30 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <header className="flex justify-between items-center pb-4 border-b border-outline-variant mb-6">
            <h2 className="font-display text-headline-lg-mobile text-primary">Cadastrar Novo Imóvel</h2>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6 text-sm text-left">
            
            {/* Section 1: Basic Info */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                1. Informações Básicas
              </h3>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Título do Anúncio</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Apartamento de Luxo no Itaim"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Tipo de Imóvel</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none"
                  >
                    <option>Apartamento</option>
                    <option>Casa</option>
                    <option>Sobrado</option>
                    <option>Terreno</option>
                    <option>Comercial</option>
                    <option>Chácara</option>
                    <option>Sítio</option>
                    <option>Fazenda</option>
                    <option>Galpão</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Condição</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none"
                  >
                    <option>Novo</option>
                    <option>Usado</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Descrição Detalhada</label>
                <textarea
                  rows={4}
                  placeholder="Descreva as qualidades do imóvel, acessibilidade, infraestrutura de comércios no bairro..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="p-3 border border-outline-variant rounded-lg bg-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all text-sm resize-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Proprietário do Imóvel</label>
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="h-11 px-3 border border-outline-variant rounded-lg bg-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all text-sm"
                >
                  <option value="">-- Selecione o Proprietário (Opcional) --</option>
                  {clients.map((c, idx) => (
                    <option key={c.id || c._id || `client-opt-${idx}`} value={c.id || c._id}>
                      {c.name} ({c.clientType === "PJ" ? "PJ" : "PF"} - {c.profileType})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Section 2: Modality & Price */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                2. Modalidade e Preço
              </h3>

              <div className="grid grid-cols-3 gap-2">
                {["Venda", "Aluguel", "Temporada"].map((item) => {
                  const isActive = modality === item;
                  return (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setModality(item)}
                      className={`py-3.5 rounded-xl border flex flex-col items-center justify-center gap-1 font-bold text-xs cursor-pointer transition-all ${
                        isActive
                          ? "bg-secondary-container/25 border-secondary text-secondary"
                          : "bg-white border-outline-variant text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      <span>{item}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Valor (R$)</label>
                  <input
                    type="number"
                    required
                    placeholder="ex: 450000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Condomínio (R$)</label>
                  <input
                    type="number"
                    placeholder="ex: 600"
                    value={condo}
                    onChange={(e) => setCondo(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">IPTU (R$)</label>
                  <input
                    type="number"
                    placeholder="ex: 150"
                    value={iptu}
                    onChange={(e) => setIptu(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Location */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                3. Localização
              </h3>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Endereço e Número</label>
                <input
                  type="text"
                  required
                  placeholder="Rua Aspicuelta, 320"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Bairro</label>
                  <input
                    type="text"
                    required
                    placeholder="Vila Madalena"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Cidade / UF</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Specifications */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                4. Especificações do Imóvel
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-on-surface-variant text-center uppercase">Quartos</label>
                  <input
                    type="number"
                    value={bedrooms}
                    onChange={(e) => setBedrooms(Math.max(0, Number(e.target.value)))}
                    className="h-11 border border-outline-variant rounded-lg text-center bg-white outline-none text-sm font-bold"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-on-surface-variant text-center uppercase">Suítes</label>
                  <input
                    type="number"
                    value={suites}
                    onChange={(e) => setSuites(Math.max(0, Number(e.target.value)))}
                    className="h-11 border border-outline-variant rounded-lg text-center bg-white outline-none text-sm font-bold"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-on-surface-variant text-center uppercase">Banh.</label>
                  <input
                    type="number"
                    value={bathrooms}
                    onChange={(e) => setBathrooms(Math.max(0, Number(e.target.value)))}
                    className="h-11 border border-outline-variant rounded-lg text-center bg-white outline-none text-sm font-bold"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-on-surface-variant text-center uppercase">Vagas</label>
                  <input
                    type="number"
                    value={parkingSpots}
                    onChange={(e) => setParkingSpots(Math.max(0, Number(e.target.value)))}
                    className="h-11 border border-outline-variant rounded-lg text-center bg-white outline-none text-sm font-bold"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-on-surface-variant text-center uppercase">Área Total (m²)</label>
                  <input
                    type="number"
                    required
                    placeholder="Ex: 120"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="h-11 border border-outline-variant rounded-lg text-center bg-white outline-none text-sm font-bold"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-on-surface-variant text-center uppercase">Área Const. (m²)</label>
                  <input
                    type="number"
                    placeholder="Ex: 100"
                    value={builtArea}
                    onChange={(e) => setBuiltArea(e.target.value)}
                    className="h-11 border border-outline-variant rounded-lg text-center bg-white outline-none text-sm font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Section 4.5: Additional Information */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                4.5. Informações Detalhadas do Imóvel
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Ano de Construção</label>
                  <input
                    type="number"
                    placeholder="Ex: 2018"
                    value={constructionYear}
                    onChange={(e) => setConstructionYear(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Andar</label>
                  <input
                    type="text"
                    placeholder="Ex: 5º andar / Térreo"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Posição do Sol</label>
                  <input
                    type="text"
                    placeholder="Ex: Sol da Manhã / Norte"
                    value={sunPosition}
                    onChange={(e) => setSunPosition(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Situação Documental</label>
                  <input
                    type="text"
                    placeholder="Ex: Escritura registrada, OK para financiamento"
                    value={documentStatus}
                    onChange={(e) => setDocumentStatus(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Situação Financeira</label>
                  <select
                    value={financialStatus}
                    onChange={(e) => setFinancialStatus(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                  >
                    <option value="quitado">Quitado</option>
                    <option value="em financiamento">Em financiamento</option>
                    <option value="não definida">Não definida</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Aceita Permuta?</label>
                  <select
                    value={acceptsExchange ? "sim" : "não"}
                    onChange={(e) => setAcceptsExchange(e.target.value === "sim")}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm font-medium"
                  >
                    <option value="não">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 5: Photos & Video Picker */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                5. Mídia do Imóvel (Fotos e Vídeos)
              </h3>

              <div className="space-y-4">
                {/* Device Upload Container */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-secondary" />
                      Fotos do dispositivo ({uploadedPhotos.length}/8)
                    </label>
                    {uploadedPhotos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setUploadedPhotos([])}
                        className="text-[11px] text-red-500 hover:underline font-bold"
                      >
                        Remover todas
                      </button>
                    )}
                  </div>

                  {/* Drag & Drop or Click Area */}
                  <div 
                    onClick={() => document.getElementById("device-photos-input")?.click()}
                    className="border-2 border-dashed border-outline-variant hover:border-secondary hover:bg-secondary/5 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group bg-surface-container-low"
                  >
                    <input
                      type="file"
                      id="device-photos-input"
                      multiple
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-full bg-surface-container-high group-hover:bg-secondary/15 flex items-center justify-center text-on-surface-variant group-hover:text-secondary transition-all">
                      {isUploadingPhotos ? (
                        <Loader2 className="w-6 h-6 animate-spin text-secondary" />
                      ) : (
                        <Upload className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">Clique para carregar fotos</p>
                      <p className="text-xs text-on-surface-variant mt-1">Carregue até 8 fotos direto do seu dispositivo.</p>
                    </div>
                  </div>

                   {/* Thumbnail Grid */}
                   {uploadedPhotos.length > 0 && (
                     <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-2">
                       {uploadedPhotos.map((photo, idx) => (
                         <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group shadow-sm border border-outline-variant">
                           <img src={photo} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedPhotos(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 rounded-full text-white transition-all scale-90 group-hover:scale-100 z-10"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            {idx === 0 ? (
                              <span className="absolute bottom-1 left-1 bg-emerald-500 text-white px-1 py-0.5 rounded text-[8px] font-bold flex items-center gap-0.5 shadow-sm z-10">
                                <Star className="w-2.5 h-2.5 fill-current text-amber-300" /> Principal
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setUploadedPhotos(prev => {
                                    const next = [...prev];
                                    const [selected] = next.splice(idx, 1);
                                    return [selected, ...next];
                                  });
                                }}
                                className="absolute bottom-1 left-1 p-1 bg-black/55 hover:bg-emerald-500 rounded text-white transition-all opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-[8px] font-bold z-10"
                                title="Definir como foto principal"
                              >
                                <Star className="w-2.5 h-2.5 text-amber-300" /> Principal
                              </button>
                            )}
                           <span className="absolute bottom-1 right-1 bg-black/50 text-white px-1 py-0.5 rounded text-[8px] font-bold font-mono">
                             #{idx + 1}
                           </span>
                         </div>
                       ))}
                     </div>
                   )}
                </div>

                {/* Fallback preset photo if no device photos are loaded */}
                {uploadedPhotos.length === 0 && (
                  <div className="space-y-2 pt-2 border-t border-dashed border-outline-variant/50">
                    <label className="text-xs font-semibold text-on-surface-variant">
                      Ou selecione uma foto padrão de arquitetura (usada se nenhuma foto for carregada):
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {presetPhotos.map((photo, idx) => {
                        const isSelected = selectedPresetPhoto === idx && !customPhotoUrl;
                        return (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => {
                              setSelectedPresetPhoto(idx);
                              setCustomPhotoUrl("");
                            }}
                            className={`relative aspect-video rounded-xl overflow-hidden border-3 transition-all cursor-pointer ${
                              isSelected ? "border-secondary scale-105 shadow-md" : "border-transparent opacity-70"
                            }`}
                          >
                            <img src={photo} alt="" className="w-full h-full object-cover" />
                          </button>
                         );
                      })}
                    </div>

                    <div className="flex flex-col gap-1 pt-1">
                      <label className="text-xs font-semibold text-on-surface-variant">Ou insira um link de foto próprio:</label>
                      <input
                        type="url"
                        placeholder="https://suaimagem.com/foto.jpg"
                        value={customPhotoUrl}
                        onChange={(e) => setCustomPhotoUrl(e.target.value)}
                        className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Video and Social Links */}
                <div className="flex flex-col gap-1 pt-2 border-t border-outline-variant/40">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-primary" />
                    Link de Vídeo (YouTube) ou Postagem de Redes Sociais
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 text-on-surface-variant pointer-events-none">
                      <Film className="w-4 h-4 animate-pulse" />
                    </div>
                    <input
                      type="url"
                      placeholder="Ex: https://www.youtube.com/watch?v=... ou post do Instagram / TikTok"
                      value={videoLink}
                      onChange={(e) => setVideoLink(e.target.value)}
                      className="w-full h-11 pl-10 pr-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-on-surface-variant">
                    Suporta links do YouTube, Instagram, Facebook, TikTok ou outras plataformas. Vídeos do YouTube serão incorporados diretamente na página de detalhes!
                  </p>
                </div>
              </div>
            </div>

            {/* Section 6: Amenities */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                6. Comodidades e Lazer
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {amenitiesList.map((item) => {
                  const isChecked = amenities.includes(item);
                  return (
                    <button
                      type="button"
                      key={item}
                      onClick={() => handleAmenityToggle(item)}
                      className={`flex items-center gap-2 p-2 border rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        isChecked
                          ? "bg-secondary-container/20 border-secondary text-secondary"
                          : "bg-white border-outline-variant text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isChecked ? "bg-secondary border-secondary text-white" : "border-outline-variant"
                      }`}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span>{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 7: Captador e Comissão */}
            <div className="space-y-4 pt-2 border-t border-outline-variant/40">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-4 bg-emerald-500 rounded-full animate-pulse"></span>
                7. Captador e Comissão do Imóvel
              </h3>
              <p className="text-xs text-on-surface-variant">
                Defina o corretor responsável pela captação deste imóvel e a comissão estimada para a transação.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Nome do Captador</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome completo"
                    value={captadorName}
                    onChange={(e) => setCaptadorName(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-emerald-500 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Telefone com DDD</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: (11) 98765-4321"
                    value={captadorPhone}
                    onChange={(e) => setCaptadorPhone(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-emerald-500 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Comissão Estimada (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 5"
                    value={estimatedCommission}
                    onChange={(e) => setEstimatedCommission(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
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
                    Salvando Imóvel...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Imóvel
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      )}

    </div>
  );
}
