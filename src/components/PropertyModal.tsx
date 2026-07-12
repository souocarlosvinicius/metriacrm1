import React, { useState } from "react";
import { motion } from "motion/react";
import { Property, Client } from "../types";
import { apiFetch } from "../api";
import { getMatchingClients } from "../utils/matching";
import { X, Bed, Square, Shield, PenTool, Trash2, Sparkles, Loader2, Save, MapPin, DollarSign, Home, Check, Upload, Video, Film, Trash, ExternalLink, MessageSquare, Copy, Star } from "lucide-react";

interface PropertyModalProps {
  property: Property;
  clients?: Client[];
  onClose: () => void;
  onUpdate: (updated: Property) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  geminiActive: boolean;
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

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
}

export default function PropertyModal({ property, clients = [], onClose, onUpdate, onDelete, geminiActive }: PropertyModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Current user and message signature states
  const [currentUser] = useState<any>(() => {
    const saved = localStorage.getItem("vega_crm_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Erro ao analisar vega_crm_user:", e);
        localStorage.removeItem("vega_crm_user");
      }
    }
    return null;
  });
  const [isCopied, setIsCopied] = useState(false);
  const [aiVersions, setAiVersions] = useState<{ professional: string; whatsapp: string; portal: string } | null>(null);
  const [activeAiTab, setActiveAiTab] = useState<"professional" | "whatsapp" | "portal">("professional");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [editedProfessional, setEditedProfessional] = useState("");
  const [editedWhatsapp, setEditedWhatsapp] = useState("");
  const [editedPortal, setEditedPortal] = useState("");

  const generateMessageText = () => {
    const p = property;
    const formattedPrice = (p.price ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    
    let signature = "";
    if (currentUser?.onboardingCompleted) {
      signature = `\n\nAtenciosamente,\n*${currentUser.name}*\n${currentUser.commercialName ? `${currentUser.commercialName} | ` : ""}${currentUser.creci ? `CRECI: ${currentUser.creci} | ` : ""}Foco: ${currentUser.actingType}\nWhatsApp: ${currentUser.phone}\nE-mail: ${currentUser.email}`;
    } else {
      signature = `\n\nAtenciosamente,\n*Corretor Metria CRM*`;
    }

    return `*🏡 ${p.title}* ${p.code ? `(${p.code})` : ""}
📍 *Localização:* ${p.neighborhood}, ${p.city}
💰 *Valor:* ${formattedPrice}

✨ *Destaques do Imóvel:*
- Área: ${p.area}m²
- Quartos: ${p.bedrooms} (${p.suites} suíte(s))
- Banheiros: ${p.bathrooms}
- Vagas: ${p.parkingSpots}

📝 *Descrição:*
${p.description || "Consulte-me para mais informações sobre este imóvel fantástico."}${signature}`;
  };

  const handleShareWhatsApp = () => {
    const message = generateMessageText();
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  const handleCopyMessage = async () => {
    const message = generateMessageText();
    try {
      await navigator.clipboard.writeText(message);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Falha ao copiar:", err);
    }
  };
  
  // Form states for editing
  const [title, setTitle] = useState(property.title);
  const [type, setType] = useState(property.type);
  const [condition, setCondition] = useState(property.condition);
  const [description, setDescription] = useState(property.description);
  const [modality, setModality] = useState(property.modality);
  const [price, setPrice] = useState(property.price);
  const [condo, setCondo] = useState(property.condo);
  const [iptu, setIptu] = useState(property.iptu);
  const [address, setAddress] = useState(property.address);
  const [neighborhood, setNeighborhood] = useState(property.neighborhood);
  const [city, setCity] = useState(property.city);
  const [bedrooms, setBedrooms] = useState(property.bedrooms);
  const [suites, setSuites] = useState(property.suites);
  const [bathrooms, setBathrooms] = useState(property.bathrooms);
  const [parkingSpots, setParkingSpots] = useState(property.parkingSpots);
  const [area, setArea] = useState(property.area);
  const [builtArea, setBuiltArea] = useState(property.builtArea || 0);
  const [constructionYear, setConstructionYear] = useState(property.constructionYear || "");
  const [floor, setFloor] = useState(property.floor || "");
  const [sunPosition, setSunPosition] = useState(property.sunPosition || "");
  const [documentStatus, setDocumentStatus] = useState(property.documentStatus || "");
  const [financialStatus, setFinancialStatus] = useState(property.financialStatus || "não definida");
  const [acceptsExchange, setAcceptsExchange] = useState(property.acceptsExchange || false);
  const [status, setStatus] = useState(property.status);
  const [ownerId, setOwnerId] = useState(property.ownerId || "");
  const [captadorName, setCaptadorName] = useState(property.captadorName || "");
  const [captadorPhone, setCaptadorPhone] = useState(property.captadorPhone || "");
  
  const [commissionPercent, setCommissionPercent] = useState<number>(() => {
    if (property.commissionPercent !== undefined) return property.commissionPercent;
    if (property.estimatedCommission !== undefined && property.estimatedCommission <= 100) return property.estimatedCommission;
    return currentUser?.defaultCommissionPercent !== undefined ? currentUser.defaultCommissionPercent : 5;
  });

  const [estimatedCommission, setEstimatedCommission] = useState<number>(() => {
    if (property.estimatedCommission !== undefined) {
      if (property.estimatedCommission > 100) return property.estimatedCommission;
      const pct = property.commissionPercent !== undefined ? property.commissionPercent : property.estimatedCommission;
      return Math.floor((property.price || 0) * pct / 100);
    }
    const defaultPct = currentUser?.defaultCommissionPercent !== undefined ? currentUser.defaultCommissionPercent : 5;
    return Math.floor((property.price || 0) * defaultPct / 100);
  });

  const handlePriceChange = (val: number) => {
    setPrice(val);
    setEstimatedCommission(Math.floor(val * commissionPercent / 100));
  };

  const handleCommissionPercentChange = (val: number) => {
    setCommissionPercent(val);
    setEstimatedCommission(Math.floor(price * val / 100));
  };

  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(property.amenities || []);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>(property.photos || []);
  const [videoLink, setVideoLink] = useState(property.videoLink || "");
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);

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

  const amenitiesList = [
    "Piscina",
    "Academia",
    "Churrasqueira",
    "Playground",
    "Salão de Festas",
    "Portaria 24h"
  ];

  const handleAmenityToggle = (amenity: string) => {
    setSelectedAmenities(prev => 
      prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
    );
  };

  const handleGenerateAiDescription = async () => {
    setIsGeneratingAi(true);
    try {
      const response = await apiFetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          condition,
          modality,
          neighborhood,
          city,
          price,
          bedrooms,
          suites,
          bathrooms,
          parkingSpots,
          area,
          amenities: selectedAmenities
        })
      });
      
      const data = await response.json();
      if (data.professional && data.whatsapp && data.portal) {
        setAiVersions(data);
        setEditedProfessional(data.professional);
        setEditedWhatsapp(data.whatsapp);
        setEditedPortal(data.portal);
        setActiveAiTab("professional");
      } else if (data.error) {
        alert(data.error);
      } else {
        alert("Ocorreu um erro ao formatar a resposta da IA.");
      }
    } catch (err) {
      console.error(err);
      alert("Falha ao se conectar com o serviço de IA. Verifique se o servidor está ativo.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updatedProperty: Property = {
        ...property,
        title,
        type,
        condition,
        description,
        modality,
        price: Number(price),
        condo: Number(condo),
        iptu: Number(iptu),
        address,
        neighborhood,
        city,
        bedrooms: Number(bedrooms),
        suites: Number(suites),
        bathrooms: Number(bathrooms),
        parkingSpots: Number(parkingSpots),
        area: Number(area),
        builtArea: Number(builtArea),
        constructionYear: constructionYear ? Number(constructionYear) : undefined,
        floor: floor || undefined,
        sunPosition: sunPosition || undefined,
        documentStatus: documentStatus || undefined,
        financialStatus: financialStatus || undefined,
        acceptsExchange: acceptsExchange,
        status,
        ownerId: ownerId || undefined,
        captadorName,
        captadorPhone,
        estimatedCommission: Number(estimatedCommission),
        commissionPercent: Number(commissionPercent),
        photos: uploadedPhotos,
        videoLink: videoLink || undefined,
        amenities: selectedAmenities
      };
      
      await onUpdate(updatedProperty);
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Tem certeza de que deseja excluir o imóvel "${property.title}"?`)) {
      try {
        await onDelete(property.id || property._id || "");
        onClose();
      } catch (err: any) {
        console.error(err);
        alert(err.message || "Erro ao excluir imóvel.");
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="relative bg-surface w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-outline-variant/30"
      >
        
        {/* Header */}
        <header className="flex justify-between items-center px-6 py-4 bg-surface border-b border-outline-variant sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Home className="text-primary w-5 h-5" />
            <h2 className="font-display text-title-md text-primary">
              {isEditing ? "Editar Imóvel" : "Detalhes do Imóvel"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-high transition-colors">
            <X className="w-5 h-5 text-on-surface-variant" />
          </button>
        </header>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {!isEditing ? (
            /* VIEW MODE */
            <div className="space-y-6">
              
              {/* Photo slider */}
              {property.photos && property.photos.length > 0 ? (
                <div className="space-y-2">
                  <div className="relative h-64 w-full rounded-xl overflow-hidden shadow-inner border border-outline-variant">
                    <img
                      src={property.photos[activePhotoIndex]}
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                        property.modality === "Venda" 
                          ? "bg-primary text-on-primary" 
                          : property.modality === "Aluguel"
                          ? "bg-secondary-container text-on-secondary-container"
                          : "bg-tertiary-container text-on-tertiary-container"
                      }`}>
                        {(property.modality || "").toUpperCase()}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                        property.status === "DISPONÍVEL"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : "bg-amber-100 text-amber-800 border border-amber-300"
                      }`}>
                        {property.status}
                      </span>
                    </div>
                  </div>
                  {/* Thumbnails */}
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {property.photos.map((photo, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActivePhotoIndex(idx)}
                        className={`relative w-16 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                          idx === activePhotoIndex ? "border-primary scale-105" : "border-transparent opacity-70"
                        }`}
                      >
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Vídeo / Rede Social */}
              {property.videoLink && (
                (() => {
                  const youtubeEmbedUrl = getYouTubeEmbedUrl(property.videoLink);
                  return (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <Video className="w-4 h-4 text-secondary" />
                        Vídeo e Apresentação do Imóvel
                      </h4>
                      {youtubeEmbedUrl ? (
                        <div className="relative aspect-video w-full rounded-xl overflow-hidden shadow-md border border-outline-variant">
                          <iframe
                            src={youtubeEmbedUrl}
                            title="Vídeo do Imóvel"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="w-full h-full"
                          />
                        </div>
                      ) : (
                        <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between gap-3 shadow-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-secondary-container/20 text-secondary flex items-center justify-center shrink-0">
                              <Film className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Postagem / Rede Social</p>
                              <p className="text-xs font-semibold text-on-surface mt-0.5 truncate pr-2">
                                {property.videoLink}
                              </p>
                            </div>
                          </div>
                          <a
                            href={property.videoLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 bg-secondary text-on-secondary font-bold text-xs rounded-lg transition-all active:scale-95 shadow-sm hover:opacity-95"
                          >
                            Acessar Link
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              {/* Title & Price */}
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 border-b border-outline-variant/50 pb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display text-headline-lg text-primary leading-tight">{property.title}</h3>
                    {property.code && (
                      <span className="px-2 py-0.5 bg-secondary-container text-on-secondary-container font-mono text-[11px] font-bold rounded-md tracking-wider shadow-sm shrink-0">
                        {property.code}
                      </span>
                    )}
                  </div>
                  <p className="text-on-surface-variant font-body-sm flex items-center gap-1 mt-1">
                    <MapPin className="w-4 h-4 text-secondary" />
                    {property.address}, {property.neighborhood} - {property.city}
                  </p>
                </div>
                <div className="bg-primary-container/20 px-4 py-2 rounded-xl border border-primary-container/30 text-right md:min-w-[160px]">
                  <p className="text-xs text-primary font-bold uppercase tracking-wider">Valor do Imóvel</p>
                  <p className="font-display text-headline-lg-mobile text-primary">
                    R$ {(property.price ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                    {property.modality !== "Venda" && <span className="text-xs font-normal"> / mês</span>}
                  </p>
                </div>
              </div>

              {/* Specifications Bento Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                <div className="flex items-center gap-3 p-2 bg-surface rounded-lg border border-outline-variant/10">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Bed className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-semibold">Quartos / Suítes</p>
                    <p className="font-bold text-on-surface text-body-sm">{property.bedrooms} Qtd ({property.suites} Suítes)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 bg-surface rounded-lg border border-outline-variant/10">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Square className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-semibold">Área Útil</p>
                    <p className="font-bold text-on-surface text-body-sm">{property.area} m²</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 bg-surface rounded-lg border border-outline-variant/10">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-semibold">Condomínio</p>
                    <p className="font-bold text-on-surface text-body-sm">R$ {property.condo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 bg-surface rounded-lg border border-outline-variant/10">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase font-semibold">IPTU Anual</p>
                    <p className="font-bold text-on-surface text-body-sm">R$ {property.iptu}</p>
                  </div>
                </div>
              </div>

              {/* Captador do Imóvel */}
              <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-sm">
                    {property.captadorName ? property.captadorName.split(" ").filter(Boolean).slice(0, 2).map(n => n?.[0] || "").join("").toUpperCase() : "CP"}
                  </div>
                  <div>
                    <p className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider">Captador do Imóvel</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="font-bold text-on-surface text-sm">{property.captadorName || "Sem Captador"}</span>
                      {property.captadorPhone && (
                        <a
                          href={`https://wa.me/55${property.captadorPhone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-white px-2 py-0.5 rounded border border-emerald-200"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          {property.captadorPhone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                {property.captadorPhone && (
                  <a
                    href={`https://wa.me/55${property.captadorPhone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="self-start sm:self-auto flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all active:scale-95 shadow-sm"
                  >
                    Falar no WhatsApp
                  </a>
                )}
              </div>

              {/* Proprietário do Imóvel */}
              {ownerId ? (
                (() => {
                  const ownerClient = clients.find(c => {
                    const cId = c.id || c._id;
                    return cId?.toString() === ownerId?.toString();
                  });
                  if (!ownerClient) return null;
                  return (
                    <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-800 font-bold text-sm">
                          {ownerClient.name ? ownerClient.name.split(" ").filter(Boolean).slice(0, 2).map(n => n?.[0] || "").join("").toUpperCase() : "PR"}
                        </div>
                        <div>
                          <p className="text-[10px] text-indigo-800 font-bold uppercase tracking-wider">Proprietário do Imóvel</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="font-bold text-on-surface text-sm">{ownerClient.name}</span>
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 text-[9px] font-bold rounded">
                              {ownerClient.clientType === "PJ" ? "Pessoa Jurídica (PJ)" : "Pessoa Física (PF)"}
                            </span>
                            {ownerClient.phone && (
                              <a
                                href={`https://wa.me/55${ownerClient.phone.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors bg-white px-2 py-0.5 rounded border border-indigo-200"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                {ownerClient.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      {ownerClient.phone && (
                        <a
                          href={`https://wa.me/55${ownerClient.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="self-start sm:self-auto flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all active:scale-95 shadow-sm"
                        >
                          Falar no WhatsApp
                        </a>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 text-center text-xs text-on-surface-variant font-medium">
                  Sem Proprietário Vinculado a este imóvel.
                </div>
              )}

              {/* Informações Adicionais */}
              <div className="space-y-3 bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                <h4 className="font-title-md text-primary text-body-lg flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-secondary rounded-full"></span>
                  Detalhes e Situação do Imóvel
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs font-medium">
                  <div className="p-2.5 bg-white rounded-lg border border-outline-variant/10 shadow-sm">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Ano de Construção</p>
                    <p className="font-semibold text-on-surface text-sm mt-0.5">{property.constructionYear || "Não informado"}</p>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-outline-variant/10 shadow-sm">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Andar</p>
                    <p className="font-semibold text-on-surface text-sm mt-0.5">{property.floor || "Não informado"}</p>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-outline-variant/10 shadow-sm">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Posição do Sol</p>
                    <p className="font-semibold text-on-surface text-sm mt-0.5">{property.sunPosition || "Não informada"}</p>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-outline-variant/10 shadow-sm">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Situação Documental</p>
                    <p className="font-semibold text-on-surface text-sm mt-0.5">{property.documentStatus || "Não informada"}</p>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-outline-variant/10 shadow-sm">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Situação Financeira</p>
                    <p className="font-semibold text-on-surface text-sm mt-0.5 capitalize">{property.financialStatus || "não definida"}</p>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-outline-variant/10 shadow-sm">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Aceita Permuta?</p>
                    <p className="font-semibold text-on-surface text-sm mt-0.5">{property.acceptsExchange ? "Sim" : "Não"}</p>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-outline-variant/10 shadow-sm col-span-1 sm:col-span-2 md:col-span-1">
                    <p className="text-[10px] text-on-surface-variant uppercase font-bold">Comissão Prevista</p>
                    <div className="mt-0.5">
                      {(() => {
                        const pct = property.commissionPercent !== undefined 
                          ? property.commissionPercent 
                          : (property.estimatedCommission !== undefined && property.estimatedCommission <= 100 ? property.estimatedCommission : undefined);
                        
                        const abs = property.estimatedCommission !== undefined && property.estimatedCommission > 100
                          ? property.estimatedCommission
                          : (property.price && pct ? Math.floor(property.price * pct / 100) : undefined);

                        if (pct !== undefined || abs !== undefined) {
                          return (
                            <div className="flex flex-col">
                              <span className="font-semibold text-emerald-600 text-sm">
                                {abs !== undefined ? `R$ ${abs.toLocaleString("pt-BR")}` : "---"}
                                {pct !== undefined ? ` (${pct}%)` : ""}
                              </span>
                              <span className="text-[9px] text-on-surface-variant font-medium italic mt-0.5 block">
                                Estimativa prévia
                              </span>
                            </div>
                          );
                        }
                        return <span className="font-semibold text-on-surface text-sm">Não informada</span>;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h4 className="font-title-md text-primary text-body-lg">Descrição do Anúncio</h4>
                <p className="text-on-surface-variant text-body-sm leading-relaxed whitespace-pre-wrap bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20 shadow-sm">
                  {property.description || "Nenhuma descrição fornecida."}
                </p>
              </div>

              {/* Amenities */}
              {property.amenities && property.amenities.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-title-md text-primary text-body-lg">Comodidades e Lazer</h4>
                  <div className="flex flex-wrap gap-2">
                    {property.amenities.map((amenity, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-secondary-container/30 text-on-secondary-container rounded-lg font-label-md text-xs flex items-center gap-1.5 border border-secondary-container/50"
                      >
                        <Shield className="w-3.5 h-3.5 text-secondary" />
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Clientes Compatíveis Matching Section */}
              <div className="space-y-3 pt-4 border-t border-outline-variant/30 text-left">
                <div className="flex items-center justify-between">
                  <h4 className="font-title-md text-primary text-body-lg flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
                    Clientes Potenciais Compatíveis
                  </h4>
                  <span className="text-[10px] text-on-surface-variant bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
                    {getMatchingClients(property, clients).length} Leads Compatíveis
                  </span>
                </div>

                {(() => {
                  const matches = getMatchingClients(property, clients);
                  if (matches.length === 0) {
                    return (
                      <div className="p-4 bg-surface-container-low border border-outline-variant/20 rounded-xl text-center text-xs text-on-surface-variant font-medium">
                        Nenhum cliente cadastrado atende aos requisitos mínimos deste imóvel no momento. Cadastre novos leads ou ajuste os interesses de seus clientes atuais.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {matches.slice(0, 4).map(({ client, score, reasons }) => {
                        const formattedPrice = (property.price || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0
                        });

                        // Pre-filled WhatsApp message about this property
                        const cleanPhone = client.phone.replace(/\D/g, "");
                        const whatsappPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                        const messageText = `Olá, *${client.name}*! Tudo bem?
Acabou de entrar em nossa carteira de imóveis do Metria CRM um(a) *${property.type}* excelente que combina perfeitamente com o seu perfil de busca:

🏡 *${property.title}*
📍 *Localização:* ${property.neighborhood || "Bairro não informado"}, ${property.city || "Cidade não informada"}
💰 *Valor:* ${formattedPrice}
📐 *Área:* ${property.area}m² | 🛏️ *Quartos:* ${property.bedrooms} | 🚿 *Banheiros:* ${property.bathrooms}

Acredito que seja a oportunidade ideal para o que você procura. Gostaria de agendar uma visita essa semana?`;

                        const whatsappUrl = `https://api.whatsapp.com/send?phone=${whatsappPhone}&text=${encodeURIComponent(messageText)}`;

                        return (
                          <div
                            key={client.id || client._id}
                            className="bg-white border border-outline-variant/35 p-3.5 rounded-xl hover:border-emerald-500/40 transition-all shadow-sm flex flex-col justify-between gap-3 text-xs"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-primary text-sm">
                                    {client.name}
                                  </span>
                                  <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
                                    {client.profileType}
                                  </span>
                                  {client.temperature && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      client.temperature === "Quente" ? "bg-red-100 text-red-800" :
                                      client.temperature === "Frio" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"
                                    }`}>
                                      {client.temperature}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                                  Interesse: <span className="font-bold text-on-surface">{client.interest || "Compra/Venda"}</span> • Prefere: <span className="font-bold text-on-surface">{client.neighborhoodOfInterest || "Qualquer Bairro"}</span>
                                </p>
                              </div>

                              <div className="flex flex-col items-end flex-shrink-0">
                                <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${
                                  score >= 80 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                                  score >= 60 ? "bg-amber-100 text-amber-800 border-amber-200" :
                                  "bg-orange-100 text-orange-800 border-orange-200"
                                }`}>
                                  {score}% Compatível
                                </span>
                                <span className="text-[10px] text-on-surface-variant/70 font-bold mt-1">
                                  Orçamento: R$ {(client.maxBudget || 0).toLocaleString("pt-BR")}
                                </span>
                              </div>
                            </div>

                            {/* Motivos da recomendação */}
                            <div className="bg-surface-container-lowest/50 p-2 rounded-lg border border-outline-variant/10 text-[10.5px]">
                              <p className="font-bold text-primary mb-1 text-[9.5px] uppercase tracking-wider">Motivos de Compatibilidade:</p>
                              <ul className="space-y-1">
                                {reasons.map((reason, rIdx) => (
                                  <li key={rIdx} className="flex items-start gap-1 text-on-surface-variant font-medium">
                                    <span className="text-emerald-600 font-bold">✓</span>
                                    <span>{reason}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Enviar WhatsApp */}
                            <div className="flex justify-end pt-1">
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-3.5 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Oferecer Imóvel pelo WhatsApp
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Compartilhar & Assinatura Panel */}
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-secondary animate-pulse" />
                      Assinatura de Mensagem Ativa
                    </h4>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">
                      {currentUser?.onboardingCompleted 
                        ? `Personalizada com seus dados do onboarding.` 
                        : "Configure seu perfil para ativar sua assinatura profissional personalizada."}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2.5 flex-wrap">
                  <button
                    onClick={handleShareWhatsApp}
                    className="flex-1 min-w-[150px] py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Compartilhar no WhatsApp
                  </button>

                  <button
                    onClick={handleCopyMessage}
                    className="flex-1 min-w-[150px] py-2 bg-white hover:bg-surface-container border border-outline-variant text-on-surface font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4 text-green-600 stroke-[3]" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-primary rotate-180" />
                        Copiar com Assinatura
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
                <button
                  onClick={handleDelete}
                  className="px-4 py-2.5 bg-red-50 text-red-700 rounded-xl font-label-md hover:bg-red-100 transition-colors flex items-center gap-2 border border-red-200"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir Imóvel
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-label-md hover:opacity-90 transition-all flex items-center gap-2 shadow-md"
                >
                  <PenTool className="w-4 h-4" />
                  Editar Detalhes
                </button>
              </div>
            </div>
          ) : (
            /* EDIT MODE */
            <form onSubmit={handleSave} className="space-y-5">
              
              {/* Form grid */}
              <div className="space-y-4">
                
                {/* Title */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-primary uppercase">Título do Anúncio</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary focus:ring-1 focus:ring-secondary outline-none bg-white transition-all text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Tipo de Imóvel</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white text-sm"
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
                    <label className="text-xs font-bold text-primary uppercase">Condição</label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white text-sm"
                    >
                      <option>Novo</option>
                      <option>Usado</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Modalidade</label>
                    <select
                      value={modality}
                      onChange={(e) => setModality(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white text-sm"
                    >
                      <option>Venda</option>
                      <option>Aluguel</option>
                      <option>Temporada</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="h-11 px-3 border border-outline-variant rounded-lg bg-white text-sm"
                    >
                      <option>DISPONÍVEL</option>
                      <option>EM PROPOSTA</option>
                      <option>VENDIDO</option>
                      <option>ALUGADO</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Valor (R$)</label>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => handlePriceChange(Number(e.target.value))}
                      required
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary outline-none bg-white text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Condomínio (R$)</label>
                    <input
                      type="number"
                      value={condo}
                      onChange={(e) => setCondo(Number(e.target.value))}
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary outline-none bg-white text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">IPTU (R$)</label>
                    <input
                      type="number"
                      value={iptu}
                      onChange={(e) => setIptu(Number(e.target.value))}
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary outline-none bg-white text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Endereço</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary outline-none bg-white text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Bairro</label>
                    <input
                      type="text"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      required
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary outline-none bg-white text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-primary uppercase">Cidade / UF</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-secondary outline-none bg-white text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-primary uppercase">Quartos</label>
                    <input
                      type="number"
                      value={bedrooms}
                      onChange={(e) => setBedrooms(Number(e.target.value))}
                      className="h-11 border border-outline-variant rounded-lg text-center bg-white text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-primary uppercase">Suítes</label>
                    <input
                      type="number"
                      value={suites}
                      onChange={(e) => setSuites(Number(e.target.value))}
                      className="h-11 border border-outline-variant rounded-lg text-center bg-white text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-primary uppercase">Banh.</label>
                    <input
                      type="number"
                      value={bathrooms}
                      onChange={(e) => setBathrooms(Number(e.target.value))}
                      className="h-11 border border-outline-variant rounded-lg text-center bg-white text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-primary uppercase">Vagas</label>
                    <input
                      type="number"
                      value={parkingSpots}
                      onChange={(e) => setParkingSpots(Number(e.target.value))}
                      className="h-11 border border-outline-variant rounded-lg text-center bg-white text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-primary uppercase">Área Total (m²)</label>
                    <input
                      type="number"
                      value={area}
                      onChange={(e) => setArea(Number(e.target.value))}
                      className="h-11 border border-outline-variant rounded-lg text-center bg-white text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-primary uppercase">Área Const. (m²)</label>
                    <input
                      type="number"
                      value={builtArea}
                      onChange={(e) => setBuiltArea(Number(e.target.value))}
                      className="h-11 border border-outline-variant rounded-lg text-center bg-white text-sm"
                    />
                  </div>
                </div>

                {/* Additional detailed fields in Edit Mode */}
                <div className="space-y-4 pt-2 border-t border-outline-variant/40">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Informações Detalhadas do Imóvel</h4>
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

                    <div className="grid grid-cols-2 gap-3 col-span-1 sm:col-span-2 bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">Comissão (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Ex: 5"
                          value={commissionPercent !== undefined ? commissionPercent : ""}
                          onChange={(e) => handleCommissionPercentChange(Number(e.target.value))}
                          className="h-10 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">Comissão Estimada (R$)</label>
                        <input
                          type="number"
                          placeholder="Ex: 25000"
                          value={estimatedCommission || ""}
                          onChange={(e) => setEstimatedCommission(Number(e.target.value))}
                          className="h-10 px-3 border border-outline-variant rounded-lg bg-white outline-none text-sm font-semibold text-emerald-700"
                        />
                      </div>
                      <span className="text-[10px] text-on-surface-variant col-span-2 font-medium italic">
                        ⚠️ Atenção: A comissão acima é apenas uma estimativa prévia do negócio.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Captador do Imóvel Edit */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-emerald-50/20 border border-emerald-100/50 rounded-xl shadow-inner">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-emerald-800 uppercase">Nome do Captador</label>
                    <input
                      type="text"
                      value={captadorName}
                      onChange={(e) => setCaptadorName(e.target.value)}
                      placeholder="Ex: Carlos Eduardo"
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-emerald-500 outline-none bg-white text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-emerald-800 uppercase">Telefone do Captador (com DDD)</label>
                    <input
                      type="text"
                      value={captadorPhone}
                      onChange={(e) => setCaptadorPhone(e.target.value)}
                      placeholder="Ex: (11) 98765-4321"
                      className="h-11 px-3 border border-outline-variant rounded-lg focus:border-emerald-500 outline-none bg-white text-sm"
                    />
                  </div>
                </div>

                {/* Proprietário do Imóvel Edit */}
                <div className="p-4 bg-indigo-50/20 border border-indigo-100/50 rounded-xl shadow-inner flex flex-col gap-1">
                  <label className="text-xs font-bold text-indigo-800 uppercase">Proprietário do Imóvel</label>
                  <select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="h-11 px-3 border border-outline-variant rounded-lg focus:border-indigo-500 outline-none bg-white text-sm"
                  >
                    <option value="">-- Selecione o Proprietário (Opcional) --</option>
                    {clients.map((c, idx) => (
                      <option key={c.id || c._id || `client-opt-${idx}`} value={c.id || c._id}>
                        {c.name} ({c.clientType === "PJ" ? "PJ" : "PF"} - {c.profileType})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mídia do Imóvel Edit */}
                <div className="space-y-4 p-4 bg-secondary/5 border border-secondary/10 rounded-xl">
                  <label className="text-xs font-bold text-primary uppercase flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-secondary" />
                    Mídia do Imóvel (Fotos e Vídeo)
                  </label>

                  {/* Device Upload */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-on-surface-variant">
                        Fotos do dispositivo ({uploadedPhotos.length}/8)
                      </label>
                      {uploadedPhotos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setUploadedPhotos([])}
                          className="text-[10px] text-red-500 hover:underline font-bold"
                        >
                          Remover todas
                        </button>
                      )}
                    </div>

                    <div 
                      onClick={() => document.getElementById("edit-device-photos-input")?.click()}
                      className="border-2 border-dashed border-outline-variant hover:border-secondary hover:bg-secondary/5 rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1 bg-white"
                    >
                      <input
                        type="file"
                        id="edit-device-photos-input"
                        multiple
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <Upload className="w-5 h-5 text-on-surface-variant group-hover:text-secondary" />
                      <p className="text-xs font-bold text-on-surface">Clique para carregar ou substituir fotos</p>
                      <p className="text-[10px] text-on-surface-variant">Máximo de 8 fotos do seu dispositivo.</p>
                    </div>

                    {uploadedPhotos.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 pt-1">
                        {uploadedPhotos.map((photo, idx) => (
                          <div key={idx} className="relative aspect-square rounded-lg overflow-hidden group shadow-sm border border-outline-variant bg-surface">
                            <img src={photo} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedPhotos(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 rounded-full text-white transition-all scale-90 group-hover:scale-100 z-10"
                            >
                              <X className="w-3 h-3" />
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
                            <span className="absolute bottom-1 right-1 bg-black/50 text-white px-1 py-0.2 rounded text-[8px] font-bold font-mono">
                              #{idx + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Geração de Fotos com IA (Recurso Premium Bloqueado) */}
                  <div className="pt-3 border-t border-secondary/10 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-on-surface-variant flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                        Gerador de Fotos de Alta Resolução com IA
                      </span>
                      <span className="text-[8px] bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">
                        Premium
                      </span>
                    </div>
                    <div className="p-3.5 bg-amber-500/5 rounded-xl border border-dashed border-amber-500/20 flex flex-col items-center justify-center text-center gap-2">
                      <p className="text-[11px] text-amber-900 dark:text-amber-300 font-medium leading-relaxed max-w-sm">
                        A geração de fotos hiper-realistas por Inteligência Artificial é exclusiva para assinantes do plano <strong>Metria Corretor</strong>. Com o Metria CRM, você não perde mais leads ou visitas por falta de uma excelente apresentação visual. Faça o upgrade agora!
                      </p>
                      <button
                        type="button"
                        onClick={() => alert("Geração de fotos com IA é um recurso do plano Metria Corretor. Para ativá-lo imediatamente, acesse a aba de Planos no menu de Ajustes!")}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 active:scale-[0.97] text-white font-bold text-[10px] rounded-lg transition-all shadow-sm cursor-pointer"
                      >
                        Quero o Plano Corretor
                      </button>
                    </div>
                  </div>

                  {/* Video and Social Links */}
                  <div className="flex flex-col gap-1 pt-1 border-t border-secondary/10">
                    <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                      <Video className="w-4 h-4 text-primary" />
                      Link de Vídeo (YouTube) ou Redes Sociais
                    </label>
                    <div className="relative flex items-center">
                      <div className="absolute left-3 text-on-surface-variant pointer-events-none">
                        <Film className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="url"
                        placeholder="Ex: https://www.youtube.com/watch?v=..."
                        value={videoLink}
                        onChange={(e) => setVideoLink(e.target.value)}
                        className="w-full h-10 pl-9 pr-3 border border-outline-variant rounded-lg bg-white focus:border-secondary outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Description & AI Button */}
                <div className="flex flex-col gap-1 relative">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-primary uppercase">Descrição Detalhada</label>
                    {geminiActive && (
                      <button
                        type="button"
                        onClick={handleGenerateAiDescription}
                        disabled={isGeneratingAi}
                        className="px-2.5 py-1 text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-semibold hover:bg-emerald-200 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {isGeneratingAi ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-secondary animate-pulse" />
                            Gerar descrição com IA
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="p-3 border border-outline-variant rounded-lg focus:border-secondary outline-none bg-white text-sm resize-none"
                    placeholder="Escreva detalhes adicionais ou clique em Gerar descrição com IA para criar versões vendedoras automaticamente..."
                  />

                  {/* AI Generated Versions Panel */}
                  {aiVersions && (
                    <div className="mt-3 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                          Versões Geradas pela IA (Gemini)
                        </div>
                        <button
                          type="button"
                          onClick={() => setAiVersions(null)}
                          className="text-[10px] text-on-surface-variant/70 hover:text-red-600 font-bold transition-colors cursor-pointer"
                        >
                          Limpar sugestões
                        </button>
                      </div>
                      
                      {/* Tabs for different versions */}
                      <div className="flex gap-1 border-b border-outline-variant/30 pb-2">
                        {(["professional", "whatsapp", "portal"] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveAiTab(tab)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              activeAiTab === tab
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-on-surface-variant hover:bg-emerald-500/10 hover:text-emerald-950"
                            }`}
                          >
                            {tab === "professional" && "💼 Profissional"}
                            {tab === "whatsapp" && "💬 WhatsApp"}
                            {tab === "portal" && "🌐 Portal"}
                          </button>
                        ))}
                      </div>

                      {/* Selected tab content with textarea for direct editing */}
                      <div className="space-y-3">
                        <textarea
                          rows={6}
                          value={
                            activeAiTab === "professional"
                              ? editedProfessional
                              : activeAiTab === "whatsapp"
                              ? editedWhatsapp
                              : editedPortal
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (activeAiTab === "professional") setEditedProfessional(val);
                            else if (activeAiTab === "whatsapp") setEditedWhatsapp(val);
                            else setEditedPortal(val);
                          }}
                          className="w-full p-3 border border-emerald-500/20 rounded-lg focus:border-emerald-500 outline-none bg-white text-xs leading-relaxed"
                          placeholder="Modifique a sugestão como desejar antes de copiar ou salvar..."
                        />

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-1">
                          <span className="text-[10px] text-emerald-800/80 font-medium italic">
                            💡 Você pode editar o texto acima antes de copiar ou salvar no imóvel.
                          </span>
                          <div className="flex gap-2 w-full sm:w-auto justify-end">
                            {/* Copy button */}
                            <button
                              type="button"
                              onClick={async () => {
                                const textToCopy =
                                  activeAiTab === "professional"
                                    ? editedProfessional
                                    : activeAiTab === "whatsapp"
                                    ? editedWhatsapp
                                    : editedPortal;
                                try {
                                  await navigator.clipboard.writeText(textToCopy);
                                  setCopiedTab(activeAiTab);
                                  setTimeout(() => setCopiedTab(null), 2000);
                                } catch (err) {
                                  console.error("Erro ao copiar:", err);
                                }
                              }}
                              className="flex items-center gap-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold px-3 py-1.5 rounded-lg border border-outline-variant transition-colors cursor-pointer"
                            >
                              {copiedTab === activeAiTab ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                  <span>Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-on-surface-variant" />
                                  <span>Copiar</span>
                                </>
                              )}
                            </button>

                            {/* Save/Use button */}
                            <button
                              type="button"
                              onClick={() => {
                                const textToUse =
                                  activeAiTab === "professional"
                                    ? editedProfessional
                                    : activeAiTab === "whatsapp"
                                    ? editedWhatsapp
                                    : editedPortal;
                                setDescription(textToUse);
                              }}
                              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Salvar no Imóvel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Amenities Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-primary uppercase block">Comodidades e Áreas Comuns</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {amenitiesList.map((amenity) => {
                      const isChecked = selectedAmenities.includes(amenity);
                      return (
                        <button
                          type="button"
                          key={amenity}
                          onClick={() => handleAmenityToggle(amenity)}
                          className={`flex items-center gap-2 p-2 border rounded-lg text-xs font-medium transition-all ${
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
                          {amenity}
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Edit actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2.5 bg-surface-container-high text-on-surface-variant rounded-xl font-label-md hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-label-md hover:opacity-90 transition-all flex items-center gap-2 shadow-md"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Salvar Alterações
                    </>
                  )}
                </button>
              </div>

            </form>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
