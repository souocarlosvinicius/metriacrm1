import { getInitialDemoData } from "./demoData";
import { supabase } from "./lib/supabase";

function mapProfileToDB(user: any): any {
  if (!user) return null;
  const dbUser: any = {};
  
  if (user.id !== undefined) dbUser.id = user.id;
  if (user._id !== undefined && !user.id) dbUser.id = user._id;
  if (user.name !== undefined) dbUser.name = user.name;
  if (user.email !== undefined) dbUser.email = user.email;
  if (user.avatarUrl !== undefined) dbUser.avatarUrl = user.avatarUrl;
  if (user.role !== undefined) dbUser.role = user.role;
  if (user.phone !== undefined) dbUser.phone = user.phone;
  if (user.whatsapp !== undefined && !user.phone) dbUser.phone = user.whatsapp;
  
  if (user.onboardingCompleted !== undefined) {
    dbUser.onboardingCompleted = user.onboardingCompleted;
  }
  if (user.commercialName !== undefined) {
    dbUser.commercialName = user.commercialName;
  }
  if (user.creci !== undefined) {
    dbUser.creci = user.creci;
  }
  if (user.primaryCity !== undefined) {
    dbUser.primaryCity = user.primaryCity;
  }
  if (user.actingType !== undefined) {
    dbUser.actingType = user.actingType;
  }
  if (user.defaultOrganizationId !== undefined) {
    dbUser.default_organization_id = user.defaultOrganizationId;
  }
  if (user.accountType !== undefined) {
    dbUser.account_type = user.accountType;
  }
  if (user.currentRole !== undefined) {
    dbUser.current_role = user.currentRole;
  }
  
  dbUser.updatedAt = new Date().toISOString();
  return dbUser;
}

function mapProfileFromDB(dbUser: any): any {
  if (!dbUser) return null;
  return {
    id: dbUser.id,
    username: dbUser.email?.split("@")[0] || "",
    name: dbUser.name,
    email: dbUser.email,
    avatarUrl: dbUser.avatarUrl || dbUser.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    role: dbUser.role || "Corretor Sênior",
    phone: dbUser.phone,
    onboardingCompleted: dbUser.onboardingCompleted !== undefined ? dbUser.onboardingCompleted : (dbUser.onboarding_completed !== undefined ? dbUser.onboarding_completed : false),
    commercialName: dbUser.commercialName || dbUser.commercial_name || "",
    creci: dbUser.creci || "",
    primaryCity: dbUser.primaryCity || dbUser.primary_city || "",
    actingType: dbUser.actingType || dbUser.acting_type || "Geral",
    defaultCommissionPercent: 0,
    pipelineStages: ['Novo', 'Em Atendimento', 'Visita Agendada', 'Proposta', 'Contrato', 'Ganho', 'Perdido'],
    leadSources: ['Indicação', 'Instagram', 'Facebook', 'OLX', 'Portal Imobiliário', 'Placa', 'WhatsApp', 'Tráfego Pago', 'Outro'],
    messageTemplates: {},
    createdAt: dbUser.createdAt || dbUser.created_at || new Date().toISOString(),
    updatedAt: dbUser.updatedAt || dbUser.updated_at || new Date().toISOString(),
    
    // Multi-tenant mapping
    defaultOrganizationId: dbUser.default_organization_id,
    accountType: dbUser.account_type || "broker",
    currentRole: dbUser.current_role
  };
}

export function clientToDb(client: any): any {
  if (!client) return null;
  const db: any = {};
  
  if (client.id !== undefined && isValidUuid(client.id)) db.id = client.id;
  if (client._id !== undefined && !client.id && isValidUuid(client._id)) db.id = client._id;
  if (client.userId !== undefined && isValidUuid(client.userId)) db.userId = client.userId;
  if (client.user_id !== undefined && isValidUuid(client.user_id)) db.userId = client.user_id;
  if (client.organizationId !== undefined && isValidUuid(client.organizationId)) db.organization_id = client.organizationId;
  if (client.organization_id !== undefined && isValidUuid(client.organization_id)) db.organization_id = client.organization_id;
  if (client.assignedTo !== undefined && isValidUuid(client.assignedTo)) db.assigned_to = client.assignedTo;
  if (client.assigned_to !== undefined && isValidUuid(client.assigned_to)) db.assigned_to = client.assigned_to;

  if (client.name !== undefined) db.name = client.name;
  if (client.phone !== undefined) db.phone = client.phone;
  if (client.email !== undefined) db.email = client.email;
  if (client.document !== undefined) db.document = client.document;
  if (client.clientType !== undefined) db.client_type = client.clientType;
  if (client.profileType !== undefined) db.profile_type = client.profileType;
  if (client.objective !== undefined) db.objective = client.objective;
  if (client.propertyType !== undefined) db.property_type = client.propertyType;
  
  if (client.minBudget !== undefined) {
    db.min_budget = client.minBudget === "" || client.minBudget === null ? 0 : Number(client.minBudget);
  }
  if (client.maxBudget !== undefined) {
    db.max_budget = client.maxBudget === "" || client.maxBudget === null ? 0 : Number(client.maxBudget);
  }
  
  if (client.observations !== undefined) db.observations = client.observations;
  if (client.birthday !== undefined) {
    db.birthday = client.birthday && client.birthday.trim() !== "" ? client.birthday : null;
  }
  if (client.address !== undefined) db.address = client.address;
  if (client.status !== undefined) db.status = client.status;
  if (client.temperature !== undefined) db.temperature = client.temperature;
  
  if (client.leadSource !== undefined) db.source = client.leadSource;
  else if (client.source !== undefined) db.source = client.source;
  
  if (client.nextAction !== undefined) db.next_action = client.nextAction;
  if (client.nextFollowUpDate !== undefined) {
    db.next_follow_up = client.nextFollowUpDate && client.nextFollowUpDate.trim() !== "" ? client.nextFollowUpDate : null;
  } else if (client.nextFollowUp !== undefined) {
    db.next_follow_up = client.nextFollowUp && client.nextFollowUp.trim() !== "" ? client.nextFollowUp : null;
  }
  
  if (client.createdAt !== undefined) db.created_at = client.createdAt;
  if (client.updatedAt !== undefined) db.updated_at = client.updatedAt;

  if (client.interest !== undefined) db.interest = client.interest;
  if (client.budgetRange !== undefined) db.budget_range = client.budgetRange;
  if (client.neighborhoodOfInterest !== undefined) db.neighborhood_of_interest = client.neighborhoodOfInterest;
  if (client.desiredPropertyType !== undefined) db.desired_property_type = client.desiredPropertyType;
  if (client.pipelineStatus !== undefined) db.pipeline_status = client.pipelineStatus;
  
  if (client.linkedPropertyId !== undefined) {
    db.linked_property_id = client.linkedPropertyId && client.linkedPropertyId.trim() !== "" && isValidUuid(client.linkedPropertyId) ? client.linkedPropertyId : null;
  }
  if (client.lossReason !== undefined) db.loss_reason = client.lossReason;
  
  if (client.commissionForecast !== undefined) {
    db.commission_forecast = client.commissionForecast === "" || client.commissionForecast === null ? 0 : Number(client.commissionForecast);
  }
  if (client.commissionPercent !== undefined) {
    db.commission_percent = client.commissionPercent === "" || client.commissionPercent === null ? 0 : Number(client.commissionPercent);
  }
  if (client.potentialValue !== undefined) {
    db.potential_value = client.potentialValue === "" || client.potentialValue === null ? 0 : Number(client.potentialValue);
  }
  if (client.closingProbability !== undefined) db.closing_probability = client.closingProbability;
  if (client.history !== undefined) {
    db.history = Array.isArray(client.history) ? client.history : [];
  }

  return db;
}

export function clientFromDb(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    organizationId: row.organization_id || row.organizationId,
    assignedTo: row.assigned_to || row.assignedTo || row.user_id || row.userId,
    createdBy: row.created_by || row.createdBy,
    name: row.name || "",
    phone: row.phone || "",
    email: row.email || "",
    document: row.document || "",
    clientType: row.client_type || row.clientType || "PF",
    profileType: row.profile_type || row.profileType || "Lead",
    objective: row.objective || "",
    propertyType: row.property_type || row.propertyType || "",
    minBudget: row.min_budget !== undefined ? Number(row.min_budget) : Number(row.minBudget || 0),
    maxBudget: row.max_budget !== undefined ? Number(row.max_budget) : Number(row.maxBudget || 0),
    observations: row.observations || "",
    birthday: row.birthday || "",
    address: row.address || "",
    status: row.status || "Novo",
    temperature: row.temperature || "Morno",
    leadSource: row.source || row.leadSource || "Outro",
    source: row.source || row.leadSource || "Outro",
    nextAction: row.next_action || row.nextAction || "",
    nextFollowUp: row.next_follow_up || row.nextFollowUp || row.nextFollowUpDate || "",
    nextFollowUpDate: row.next_follow_up || row.nextFollowUp || row.nextFollowUpDate || "",
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
    interest: row.interest || "Compra",
    budgetRange: row.budget_range || row.budgetRange || "",
    neighborhoodOfInterest: row.neighborhood_of_interest || row.neighborhoodOfInterest || "",
    desiredPropertyType: row.desired_property_type || row.desiredPropertyType || "",
    pipelineStatus: row.pipeline_status || row.pipelineStatus || row.status || "Novo",
    linkedPropertyId: row.linked_property_id || row.linkedPropertyId || null,
    lossReason: row.loss_reason || row.lossReason || "",
    commissionForecast: row.commission_forecast !== undefined ? Number(row.commission_forecast) : Number(row.commissionForecast || 0),
    commissionPercent: row.commission_percent !== undefined ? Number(row.commission_percent) : Number(row.commissionPercent || 0),
    potentialValue: row.potential_value !== undefined ? Number(row.potential_value) : Number(row.potentialValue || 0),
    closingProbability: row.closing_probability || row.closingProbability || "Média",
    history: Array.isArray(row.history) ? row.history : []
  };
}

export function propertyToDb(property: any): any {
  if (!property) return null;
  const db: any = {};

  if (property.id !== undefined && isValidUuid(property.id)) db.id = property.id;
  if (property._id !== undefined && !property.id && isValidUuid(property._id)) db.id = property._id;
  if (property.userId !== undefined && isValidUuid(property.userId)) db.userId = property.userId;
  if (property.user_id !== undefined && isValidUuid(property.user_id)) db.userId = property.user_id;
  if (property.organizationId !== undefined && isValidUuid(property.organizationId)) db.organization_id = property.organizationId;
  if (property.organization_id !== undefined && isValidUuid(property.organization_id)) db.organization_id = property.organization_id;
  if (property.assignedTo !== undefined && isValidUuid(property.assignedTo)) db.assigned_to = property.assignedTo;
  if (property.assigned_to !== undefined && isValidUuid(property.assigned_to)) db.assigned_to = property.assigned_to;

  if (property.code !== undefined) db.code = property.code;
  if (property.ownerId !== undefined) {
    db.ownerId = property.ownerId && isValidUuid(property.ownerId) ? property.ownerId : null;
  }
  if (property.owner_id !== undefined && !property.ownerId) {
    db.ownerId = property.owner_id && isValidUuid(property.owner_id) ? property.owner_id : null;
  }
  if (property.title !== undefined) db.title = property.title;
  if (property.type !== undefined) db.type = property.type;
  if (property.condition !== undefined) db.condition = property.condition;
  if (property.description !== undefined) db.description = property.description;
  if (property.modality !== undefined) db.modality = property.modality;
  
  if (property.price !== undefined) db.price = property.price === "" || property.price === null ? 0 : Number(property.price);
  if (property.condo !== undefined) db.condo = property.condo === "" || property.condo === null ? 0 : Number(property.condo);
  if (property.iptu !== undefined) db.iptu = property.iptu === "" || property.iptu === null ? 0 : Number(property.iptu);
  
  if (property.address !== undefined) db.address = property.address;
  if (property.neighborhood !== undefined) db.neighborhood = property.neighborhood;
  if (property.city !== undefined) db.city = property.city;
  
  if (property.bedrooms !== undefined) db.bedrooms = Number(property.bedrooms || 0);
  if (property.suites !== undefined) db.suites = Number(property.suites || 0);
  if (property.bathrooms !== undefined) db.bathrooms = Number(property.bathrooms || 0);
  if (property.parkingSpots !== undefined) db.parkingSpots = Number(property.parkingSpots || 0);
  if (property.parking_spots !== undefined && !property.parkingSpots) db.parkingSpots = Number(property.parking_spots || 0);
  
  if (property.area !== undefined) db.area = Number(property.area || 0);
  if (property.builtArea !== undefined) db.builtArea = Number(property.builtArea || 0);
  if (property.built_area !== undefined && !property.builtArea) db.builtArea = Number(property.built_area || 0);
  
  if (property.constructionYear !== undefined) db.constructionYear = Number(property.constructionYear || 0);
  if (property.construction_year !== undefined && !property.constructionYear) db.constructionYear = Number(property.construction_year || 0);
  
  if (property.floor !== undefined) db.floor = property.floor;
  if (property.sunPosition !== undefined) db.sunPosition = property.sunPosition;
  if (property.sun_position !== undefined && !property.sunPosition) db.sunPosition = property.sun_position;
  
  if (property.documentStatus !== undefined) db.documentStatus = property.documentStatus;
  if (property.document_status !== undefined && !property.documentStatus) db.documentStatus = property.document_status;
  
  if (property.financialStatus !== undefined) db.financialStatus = property.financialStatus;
  if (property.financial_status !== undefined && !property.financialStatus) db.financialStatus = property.financial_status;
  
  if (property.acceptsExchange !== undefined) db.acceptsExchange = property.acceptsExchange;
  if (property.accepts_exchange !== undefined && !property.acceptsExchange) db.acceptsExchange = property.accepts_exchange;
  
  if (property.photos !== undefined) db.photos = Array.isArray(property.photos) ? property.photos : [];
  if (property.videoLink !== undefined) db.videoLink = property.videoLink;
  if (property.video_link !== undefined && !property.videoLink) db.videoLink = property.video_link;
  
  if (property.amenities !== undefined) db.amenities = Array.isArray(property.amenities) ? property.amenities : [];
  if (property.status !== undefined) db.status = property.status;
  
  if (property.captadorName !== undefined) db.captadorName = property.captadorName;
  if (property.captador_name !== undefined && !property.captadorName) db.captadorName = property.captador_name;
  
  if (property.captadorPhone !== undefined) db.captadorPhone = property.captadorPhone;
  if (property.captador_phone !== undefined && !property.captadorPhone) db.captadorPhone = property.captador_phone;
  
  if (property.estimatedCommission !== undefined) db.estimatedCommission = Number(property.estimatedCommission || 0);
  if (property.estimated_commission !== undefined && !property.estimatedCommission) db.estimatedCommission = Number(property.estimated_commission || 0);
  
  if (property.commissionPercent !== undefined) db.commissionPercent = Number(property.commissionPercent || 0);
  if (property.commission_percent !== undefined && !property.commissionPercent) db.commissionPercent = Number(property.commission_percent || 0);
  
  if (property.createdAt !== undefined) db.createdAt = property.createdAt;
  if (property.updatedAt !== undefined) db.updatedAt = property.updatedAt;

  return db;
}

export function propertyFromDb(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    organizationId: row.organization_id || row.organizationId,
    assignedTo: row.assigned_to || row.assignedTo || row.user_id || row.userId,
    createdBy: row.created_by || row.createdBy,
    code: row.code || "",
    ownerId: row.owner_id || row.ownerId || null,
    title: row.title || "",
    type: row.type || "Apartamento",
    condition: row.condition || "Usado",
    description: row.description || "",
    modality: row.modality || "Venda",
    price: Number(row.price || 0),
    condo: Number(row.condo || 0),
    iptu: Number(row.iptu || 0),
    address: row.address || "",
    neighborhood: row.neighborhood || "",
    city: row.city || "",
    bedrooms: Number(row.bedrooms || 0),
    suites: Number(row.suites || 0),
    bathrooms: Number(row.bathrooms || 0),
    parkingSpots: Number(row.parking_spots || row.parkingSpots || 0),
    area: Number(row.area || 0),
    builtArea: Number(row.built_area || row.builtArea || 0),
    constructionYear: Number(row.construction_year || row.constructionYear || 0),
    floor: row.floor || "",
    sunPosition: row.sun_position || row.sunPosition || "",
    documentStatus: row.document_status || row.documentStatus || "",
    financialStatus: row.financial_status || row.financialStatus || "",
    acceptsExchange: row.accepts_exchange !== undefined ? row.accepts_exchange : (row.acceptsExchange || false),
    photos: Array.isArray(row.photos) ? row.photos : [],
    videoLink: row.video_link || row.videoLink || "",
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    status: row.status || "Disponível",
    captadorName: row.captador_name || row.captadorName || "",
    captadorPhone: row.captador_phone || row.captadorPhone || "",
    estimatedCommission: Number(row.estimated_commission || row.estimatedCommission || 0),
    commissionPercent: Number(row.commission_percent || row.commissionPercent || 0),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

export function taskToDb(task: any): any {
  if (!task) return null;
  const db: any = {};

  if (task.id !== undefined && isValidUuid(task.id)) db.id = task.id;
  if (task.userId !== undefined && isValidUuid(task.userId)) db.userId = task.userId;
  if (task.user_id !== undefined && isValidUuid(task.user_id)) db.userId = task.user_id;
  if (task.organizationId !== undefined && isValidUuid(task.organizationId)) db.organization_id = task.organizationId;
  if (task.organization_id !== undefined && isValidUuid(task.organization_id)) db.organization_id = task.organization_id;
  if (task.assignedTo !== undefined && isValidUuid(task.assignedTo)) db.assigned_to = task.assignedTo;
  if (task.assigned_to !== undefined && isValidUuid(task.assigned_to)) db.assigned_to = task.assigned_to;

  if (task.date !== undefined) db.date = task.date;
  if (task.time !== undefined) db.time = task.time;
  if (task.title !== undefined) db.title = task.title;
  
  if (task.clientId !== undefined) {
    db.clientId = task.clientId && isValidUuid(task.clientId) ? task.clientId : null;
  }
  if (task.client_id !== undefined && !task.clientId) {
    db.clientId = task.client_id && isValidUuid(task.client_id) ? task.client_id : null;
  }
  if (task.clientName !== undefined) db.clientName = task.clientName;
  if (task.client_name !== undefined) db.clientName = task.client_name;
  
  if (task.propertyId !== undefined) {
    db.propertyId = task.propertyId && isValidUuid(task.propertyId) ? task.propertyId : null;
  }
  if (task.property_id !== undefined && !task.propertyId) {
    db.propertyId = task.property_id && isValidUuid(task.property_id) ? task.property_id : null;
  }
  if (task.propertyTitle !== undefined) db.propertyTitle = task.propertyTitle;
  if (task.property_title !== undefined) db.propertyTitle = task.property_title;
  
  if (task.type !== undefined) db.type = task.type;
  if (task.priority !== undefined) db.priority = task.priority;
  if (task.completed !== undefined) db.completed = task.completed;
  if (task.description !== undefined) db.description = task.description;
  if (task.createdAt !== undefined) db.createdAt = task.createdAt;
  if (task.updatedAt !== undefined) db.updatedAt = task.updatedAt;

  return db;
}

export function taskFromDb(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    organizationId: row.organization_id || row.organizationId,
    assignedTo: row.assigned_to || row.assignedTo || row.user_id || row.userId,
    createdBy: row.created_by || row.createdBy,
    date: row.date || "",
    time: row.time || "",
    title: row.title || "",
    clientId: row.client_id || row.clientId || null,
    clientName: row.client_name || row.clientName || "",
    propertyId: row.property_id || row.propertyId || null,
    propertyTitle: row.property_title || row.propertyTitle || "",
    type: row.type || "Outro",
    priority: row.priority || "média",
    completed: row.completed !== undefined ? row.completed : false,
    description: row.description || "",
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

export function proposalToDb(proposal: any): any {
  if (!proposal) return null;
  const db: any = {};

  if (proposal.id !== undefined && isValidUuid(proposal.id)) db.id = proposal.id;
  if (proposal.userId !== undefined && isValidUuid(proposal.userId)) db.userId = proposal.userId;
  if (proposal.user_id !== undefined && isValidUuid(proposal.user_id)) db.userId = proposal.user_id;
  if (proposal.organizationId !== undefined && isValidUuid(proposal.organizationId)) db.organization_id = proposal.organizationId;
  if (proposal.organization_id !== undefined && isValidUuid(proposal.organization_id)) db.organization_id = proposal.organization_id;
  if (proposal.assignedTo !== undefined && isValidUuid(proposal.assignedTo)) db.assigned_to = proposal.assignedTo;
  if (proposal.assigned_to !== undefined && isValidUuid(proposal.assigned_to)) db.assigned_to = proposal.assigned_to;

  if (proposal.clientId !== undefined) {
    db.clientId = proposal.clientId && isValidUuid(proposal.clientId) ? proposal.clientId : null;
  }
  if (proposal.client_id !== undefined && !proposal.clientId) {
    db.clientId = proposal.client_id && isValidUuid(proposal.client_id) ? proposal.client_id : null;
  }
  if (proposal.clientName !== undefined) db.clientName = proposal.clientName;
  if (proposal.client_name !== undefined) db.clientName = proposal.client_name;

  if (proposal.propertyId !== undefined) {
    db.propertyId = proposal.propertyId && isValidUuid(proposal.propertyId) ? proposal.propertyId : null;
  }
  if (proposal.property_id !== undefined && !proposal.propertyId) {
    db.propertyId = proposal.property_id && isValidUuid(proposal.property_id) ? proposal.property_id : null;
  }
  if (proposal.propertyTitle !== undefined) db.propertyTitle = proposal.propertyTitle;
  if (proposal.property_title !== undefined) db.propertyTitle = proposal.property_title;

  if (proposal.proposedValue !== undefined) db.proposedValue = Number(proposal.proposedValue || 0);
  if (proposal.proposed_value !== undefined) db.proposedValue = Number(proposal.proposed_value || 0);
  
  if (proposal.status !== undefined) db.status = proposal.status;
  if (proposal.date !== undefined) db.date = proposal.date;
  if (proposal.observations !== undefined) db.observations = proposal.observations;
  
  if (proposal.nextAction !== undefined) db.nextAction = proposal.nextAction;
  if (proposal.next_action !== undefined) db.nextAction = proposal.next_action;
  
  if (proposal.createdAt !== undefined) db.createdAt = proposal.createdAt;
  if (proposal.updatedAt !== undefined) db.updatedAt = proposal.updatedAt;

  return db;
}

export function proposalFromDb(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    organizationId: row.organization_id || row.organizationId,
    assignedTo: row.assigned_to || row.assignedTo || row.user_id || row.userId,
    createdBy: row.created_by || row.createdBy,
    clientId: row.client_id || row.clientId || "",
    clientName: row.client_name || row.clientName || "",
    propertyId: row.property_id || row.propertyId || "",
    propertyTitle: row.property_title || row.propertyTitle || "",
    proposedValue: Number(row.proposed_value || row.proposedValue || 0),
    status: row.status || "Pendente",
    date: row.date || "",
    observations: row.observations || "",
    nextAction: row.next_action || row.nextAction || "",
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

export function visitToDb(visit: any): any {
  if (!visit) return null;
  const db: any = {};

  if (visit.id !== undefined && isValidUuid(visit.id)) db.id = visit.id;
  if (visit.userId !== undefined && isValidUuid(visit.userId)) db.userId = visit.userId;
  if (visit.user_id !== undefined && isValidUuid(visit.user_id)) db.userId = visit.user_id;
  if (visit.organizationId !== undefined && isValidUuid(visit.organizationId)) db.organization_id = visit.organizationId;
  if (visit.organization_id !== undefined && isValidUuid(visit.organization_id)) db.organization_id = visit.organization_id;
  if (visit.assignedTo !== undefined && isValidUuid(visit.assignedTo)) db.assigned_to = visit.assignedTo;
  if (visit.assigned_to !== undefined && isValidUuid(visit.assigned_to)) db.assigned_to = visit.assigned_to;

  if (visit.clientId !== undefined) {
    db.clientId = visit.clientId && isValidUuid(visit.clientId) ? visit.clientId : null;
  }
  if (visit.client_id !== undefined && !visit.clientId) {
    db.clientId = visit.client_id && isValidUuid(visit.client_id) ? visit.client_id : null;
  }
  if (visit.clientName !== undefined) db.clientName = visit.clientName;
  if (visit.client_name !== undefined) db.clientName = visit.client_name;

  if (visit.propertyId !== undefined) {
    db.propertyId = visit.propertyId && isValidUuid(visit.propertyId) ? visit.propertyId : null;
  }
  if (visit.property_id !== undefined && !visit.propertyId) {
    db.propertyId = visit.property_id && isValidUuid(visit.property_id) ? visit.property_id : null;
  }
  if (visit.propertyTitle !== undefined) db.propertyTitle = visit.propertyTitle;
  if (visit.property_title !== undefined) db.propertyTitle = visit.property_title;

  if (visit.date !== undefined) db.date = visit.date;
  if (visit.time !== undefined) db.time = visit.time;
  if (visit.status !== undefined) db.status = visit.status;
  if (visit.observations !== undefined) db.observations = visit.observations;
  if (visit.feedback !== undefined) db.feedback = visit.feedback;
  
  if (visit.createdAt !== undefined) db.createdAt = visit.createdAt;
  if (visit.updatedAt !== undefined) db.updatedAt = visit.updatedAt;

  return db;
}

export function visitFromDb(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    organizationId: row.organization_id || row.organizationId,
    assignedTo: row.assigned_to || row.assignedTo || row.user_id || row.userId,
    createdBy: row.created_by || row.createdBy,
    clientId: row.client_id || row.clientId || "",
    clientName: row.client_name || row.clientName || "",
    propertyId: row.property_id || row.propertyId || "",
    propertyTitle: row.property_title || row.propertyTitle || "",
    date: row.date || "",
    time: row.time || "",
    status: row.status || "Agendada",
    observations: row.observations || "",
    feedback: row.feedback || "",
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

export function profileToDb(profile: any): any {
  return mapProfileToDB(profile);
}

export function profileFromDb(row: any): any {
  return mapProfileFromDB(row);
}

export function isValidUuid(val: any): boolean {
  if (typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

// Helper to check if the current session is a Demo mode session
function isDemoSession(): boolean {
  const saved = localStorage.getItem("vega_crm_user");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return parsed && parsed.isDemo === true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// Lazy initialization of demo data in localStorage
const getLocalData = (key: string, initialFetcher: () => any) => {
  const existing = localStorage.getItem(key);
  if (existing) {
    try {
      return JSON.parse(existing);
    } catch (e) {
      console.error(`Error parsing ${key}`, e);
    }
  }
  const initial = initialFetcher();
  localStorage.setItem(key, JSON.stringify(initial));
  return initial;
};

const saveLocalData = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify(data));
};

// Initial state helpers
const getInitialProps = () => getInitialDemoData().properties;
const getInitialClients = () => getInitialDemoData().clients;
const getInitialProposals = () => getInitialDemoData().proposals;
const getInitialVisits = () => getInitialDemoData().visits;
const getInitialTasks = () => getInitialDemoData().tasks;



async function checkSupabaseSchemaMissing(): Promise<boolean> {
  // Check if Supabase is using placeholder credentials or not set
  const url = import.meta.env.VITE_SUPABASE_URL || "";
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || url.includes("placeholder") || !key || key.includes("placeholder")) {
    return true;
  }

  try {
    const { error } = await supabase.from("clients").select("id").limit(1);
    if (error) {
      const code = error.code || "";
      const msg = (error.message || "").toLowerCase();
      if (
        code === "PGRST205" ||
        code === "42P01" ||
        (msg.includes("relation") && msg.includes("exist")) ||
        (msg.includes("table") && msg.includes("exist")) ||
        (msg.includes("tabela") && msg.includes("existe"))
      ) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  // Helper to construct a mock JSON response
  const mockResponse = (data: any, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  };

  // --- REAL SESSION ACTIVE: COMMUNICATING DIRECTLY WITH SUPABASE ---
  const isDemoUrl = isDemoSession() || url.includes("/api/demo/reset") || url.includes("isDemo=true");

  if (!isDemoUrl) {
    const method = (init?.method || "GET").toUpperCase();
    const urlObj = new URL(url, "http://localhost");
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;

    let body: any = null;
    if (init?.body) {
      try {
        body = JSON.parse(init.body as string);
      } catch (e) {
        // body is not JSON or is FormData
      }
    }

    // Define a helper to get current session and throw 401 if missing
    const getActiveUserSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    };

    const getOrgMemberRole = async (orgId: string, userId: string): Promise<string | null> => {
      const { data } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      return data?.role || null;
    };

    const checkPlanLimit = async (
      orgId: string | null | undefined,
      resource: "clients" | "properties" | "members"
    ): Promise<{ allowed: boolean; error?: string }> => {
      if (!orgId) return { allowed: true };

      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .select("plan")
        .eq("id", orgId)
        .maybeSingle();

      if (orgErr || !org) {
        return { allowed: true };
      }

      const plan = org.plan || "beta";

      if (resource === "clients") {
        if (plan === "beta") {
          const { count, error: countErr } = await supabase
            .from("clients")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", orgId);

          if (!countErr && count !== null && count >= 10) {
            return {
              allowed: false,
              error: "Limite de 10 leads/clientes ativos atingido para o plano Beta. Faça o upgrade do seu plano nas Configurações para cadastrar mais clientes."
            };
          }
        }
      } else if (resource === "properties") {
        if (plan === "beta") {
          const { count, error: countErr } = await supabase
            .from("properties")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", orgId);

          if (!countErr && count !== null && count >= 5) {
            return {
              allowed: false,
              error: "Limite de 5 imóveis atingido para o plano Beta. Faça o upgrade do seu plano nas Configurações para cadastrar mais imóveis."
            };
          }
        }
      } else if (resource === "members") {
        if (plan !== "max") {
          return {
            allowed: false,
            error: "Seu plano de assinatura atual não permite ter equipe ou convidar outros corretores. Faça o upgrade para o Plano Max para gerenciar equipe."
          };
        } else {
          const { count, error: countErr } = await supabase
            .from("organization_members")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", orgId);

          if (!countErr && count !== null && count >= 5) {
            return {
              allowed: false,
              error: "Limite de 5 corretores na equipe atingido para o Plano Max."
            };
          }
        }
      }

      return { allowed: true };
    };

    // Forward AI/Gemini requests to Express backend with bearer token
    if (pathname.startsWith("/api/ai/")) {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);

      // Validate plan can use AI (Pro and Max only)
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_organization_id")
        .eq("id", session.user.id)
        .maybeSingle();

      const activeOrgId = profile?.default_organization_id;
      if (activeOrgId) {
        const { data: org } = await supabase
          .from("organizations")
          .select("plan")
          .eq("id", activeOrgId)
          .maybeSingle();

        const plan = org?.plan || "beta";
        if (plan === "beta" || plan === "start") {
          return mockResponse({
            error: "Funcionalidade bloqueada. O uso da Inteligência Artificial (Gemini AI) está disponível apenas nos planos Pro e Max. Faça o upgrade nas Configurações!"
          }, 403);
        }
      }

      init = init || {};
      init.headers = {
        ...(init.headers || {}),
        "Content-Type": "application/json"
      };
      if (session?.access_token) {
        (init.headers as any)["Authorization"] = `Bearer ${session.access_token}`;
      }
      try {
        const absoluteUrl = `${window.location.origin}${pathname}`;
        const res = await window.fetch(absoluteUrl, init);
        if (res.ok) {
          return res;
        }
        console.warn(`[Supabase Fallback] Backend fetch returned status ${res.status}. Falling back to local offline handler.`);
      } catch (fetchErr) {
        console.warn("[Supabase Fallback] Backend fetch failed with error:", fetchErr, ". Falling back to local offline handler.");
      }

      // Recursive call with forced demo parameter to run the local mock block!
      const fallbackUrl = url.includes("?") ? `${url}&isDemo=true` : `${url}?isDemo=true`;
      return apiFetch(fallbackUrl, init);
    }

    // Forward organization creation/fetch to Express backend with bearer token
    if (pathname === "/api/organizations" && (method === "GET" || method === "POST")) {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);

      init = init || {};
      init.headers = {
        ...(init.headers || {}),
        "Content-Type": "application/json"
      };
      if (session?.access_token) {
        (init.headers as any)["Authorization"] = `Bearer ${session.access_token}`;
      }
      try {
        const absoluteUrl = `${window.location.origin}${pathname}`;
        const res = await window.fetch(absoluteUrl, init);
        if (res.ok) {
          return res;
        }
        console.warn(`[Supabase Fallback] Backend fetch returned status ${res.status}. Falling back to local offline handler.`);
      } catch (fetchErr) {
        console.warn("[Supabase Fallback] Backend fetch failed with error:", fetchErr, ". Falling back to local offline handler.");
      }

      // Recursive call with forced demo parameter to run the local mock block!
      const fallbackUrl = url.includes("?") ? `${url}&isDemo=true` : `${url}?isDemo=true`;
      return apiFetch(fallbackUrl, init);
    }

    // 1. SYSTEM STATUS
    if (pathname === "/api/status") {
      const isMissing = await checkSupabaseSchemaMissing();
      return mockResponse({
        dbType: isMissing ? "Supabase (Tabelas ausentes - Usando Fallback Offline)" : "Supabase Database (PostgreSQL)",
        supabaseActive: !isMissing,
        geminiActive: true,
        schemaMissing: isMissing
      });
    }

    // 2. AUTHENTICATION ENDPOINTS
    if (pathname === "/api/auth/me") {
      const session = await getActiveUserSession();
      if (!session?.user) {
        return mockResponse({ error: "Sessão expirada ou não autorizado. Por favor, faça login." }, 401);
      }
      // Get profile details
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar perfil no /api/auth/me do Supabase:", error);
      }

      if (!profile) {
        const fallbackProfile = {
          id: session.user.id,
          username: session.user.email?.split("@")[0] || "",
          name: session.user.user_metadata?.name || "",
          email: session.user.email,
          avatarUrl: session.user.user_metadata?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
          role: session.user.user_metadata?.role || "Corretor Sênior",
          phone: session.user.user_metadata?.phone || "",
          onboardingCompleted: false
        };
        // Auto-create profile if missing
        const dbFallback = mapProfileToDB(fallbackProfile);
        const { error: upsertError } = await supabase.from("profiles").upsert(dbFallback);
        if (upsertError) {
          console.error("Erro ao criar perfil fallback no Supabase:", upsertError);
          return mockResponse({ 
            error: "Erro ao criar perfil fallback no Supabase", 
            message: upsertError.message, 
            details: upsertError.details, 
            hint: upsertError.hint, 
            code: upsertError.code 
          }, 400);
        }
        return mockResponse(fallbackProfile);
      }
      return mockResponse(mapProfileFromDB(profile));
    }

    if (pathname === "/api/auth/login") {
      const { username, password } = body;
      const emailVal = username.includes("@") ? username : `${username}@metriacrm.com.br`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailVal,
        password: password
      });
      if (error) {
        return mockResponse({ error: "Email ou senha inválidos." }, 400);
      }
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileErr) {
        console.error("Erro ao buscar perfil durante login:", profileErr);
      }

      return mockResponse(mapProfileFromDB(profile) || {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || "",
        onboardingCompleted: false
      });
    }

    if (pathname === "/api/auth/register") {
      const { email, password, name, username, role, phone, avatarUrl } = body;
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            name,
            username,
            role,
            phone,
            avatarUrl
          }
        }
      });
      if (error) {
        return mockResponse({ error: error.message }, 400);
      }
      const profileData = {
        id: data.user!.id,
        email: email,
        name: name,
        username: username,
        role: role,
        phone: phone,
        avatarUrl: avatarUrl,
        onboardingCompleted: false
      };
      const dbProfile = mapProfileToDB(profileData);
      const { error: upsertError } = await supabase.from("profiles").upsert(dbProfile);
      if (upsertError) {
        console.error("Erro ao cadastrar perfil no Supabase:", upsertError);
      }
      return mockResponse(profileData);
    }

    if (pathname === "/api/auth/logout") {
      await supabase.auth.signOut();
      return mockResponse({ success: true });
    }

    if (pathname.startsWith("/api/auth/update/")) {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);
      
      const dbUpdate = mapProfileToDB({
        id: session.user.id,
        email: session.user.email,
        ...body
      });

      const { data, error } = await supabase
        .from("profiles")
        .upsert(dbUpdate, { onConflict: "id" })
        .select()
        .maybeSingle();

      if (error) {
        console.error("Erro ao atualizar ou criar perfil via upsert no Supabase:", error);
        return mockResponse({ error: "Erro ao salvar os dados do perfil: " + error.message }, 400);
      }
      return mockResponse(mapProfileFromDB(data));
    }

    // ==========================================
    // MULTI-TENANT ENDPOINTS (REAL SESSION)
    // ==========================================
    
    // 1. GET ORGANIZATIONS OF THE CURRENT USER - Passed to real Express backend
    // 2. CREATE A NEW ORGANIZATION - Passed to real Express backend

    // 2.5 UPDATE PLAN FOR ORGANIZATION
    if (pathname.startsWith("/api/organizations/") && pathname.endsWith("/plan") && method === "PUT") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);

      const parts = pathname.split("/");
      const orgId = parts[3];
      const { plan } = body;

      if (!["beta", "start", "pro", "max"].includes(plan)) {
        return mockResponse({ error: "Plano inválido" }, 400);
      }

      const { data: updatedOrg, error: updateErr } = await supabase
        .from("organizations")
        .update({
          plan,
          subscription_status: "active",
          plan_updated_at: new Date().toISOString()
        })
        .eq("id", orgId)
        .select()
        .single();

      if (updateErr) return mockResponse({ error: updateErr.message }, 400);

      return mockResponse({
        id: updatedOrg.id,
        name: updatedOrg.name,
        tradeName: updatedOrg.trade_name,
        creci: updatedOrg.creci,
        phone: updatedOrg.phone,
        email: updatedOrg.email,
        city: updatedOrg.city,
        state: updatedOrg.state,
        ownerId: updatedOrg.owner_id,
        plan: updatedOrg.plan,
        subscriptionStatus: updatedOrg.subscription_status
      });
    }

    // 3. GET MEMBERS OF THE ACTIVE ORGANIZATION
    if (pathname === "/api/organizations/members" && method === "GET") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse([], 401);

      const activeOrgId = searchParams.get("organizationId");
      if (!activeOrgId) return mockResponse({ error: "Organization ID is required" }, 400);

      const { data: members, error: memErr } = await supabase
        .from("organization_members")
        .select("*")
        .eq("organization_id", activeOrgId);

      if (memErr) return mockResponse({ error: memErr.message }, 400);
      
      const mappedMembers = (members || []).map(m => ({
        id: m.id,
        organizationId: m.organization_id,
        userId: m.user_id,
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.status,
        joinedAt: m.joined_at
      }));

      return mockResponse(mappedMembers);
    }

    // 4. UPDATE MEMBER DETAILS
    if (pathname.startsWith("/api/organizations/members/") && method === "PUT") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);
      const memberId = pathname.split("/").pop();

      const { role, status } = body;
      const { data, error } = await supabase
        .from("organization_members")
        .update({ role, status })
        .eq("id", memberId)
        .select()
        .single();

      if (error) return mockResponse({ error: error.message }, 400);
      return mockResponse({
        id: data.id,
        organizationId: data.organization_id,
        userId: data.user_id,
        name: data.name,
        email: data.email,
        role: data.role,
        status: data.status
      });
    }

    // 5. GET INVITES OF THE ACTIVE ORGANIZATION
    if (pathname === "/api/organizations/invites" && method === "GET") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse([], 401);

      const activeOrgId = searchParams.get("organizationId");
      if (!activeOrgId) return mockResponse({ error: "Organization ID is required" }, 400);

      const { data: invites, error: invErr } = await supabase
        .from("organization_invites")
        .select("*")
        .eq("organization_id", activeOrgId);

      if (invErr) return mockResponse({ error: invErr.message }, 400);

      const mappedInvites = (invites || []).map(inv => ({
        id: inv.id,
        organizationId: inv.organization_id,
        invitedEmail: inv.invited_email,
        invitedName: inv.invited_name,
        role: inv.role,
        token: inv.token,
        status: inv.status,
        createdAt: inv.created_at,
        expiresAt: inv.expires_at
      }));

      return mockResponse(mappedInvites);
    }

    // 6. CREATE AN INVITE FOR THE ACTIVE ORGANIZATION
    if (pathname === "/api/organizations/invites" && method === "POST") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);

      const { organizationId, invitedEmail, invitedName, role } = body;

      const planCheck = await checkPlanLimit(organizationId, "members");
      if (!planCheck.allowed) {
        return mockResponse({ error: planCheck.error }, 403);
      }

      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      const { data: invite, error: invErr } = await supabase
        .from("organization_invites")
        .insert({
          organization_id: organizationId,
          invited_email: invitedEmail,
          invited_name: invitedName,
          role: role || "broker",
          token,
          status: "pending",
          invited_by: session.user.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (invErr) return mockResponse({ error: invErr.message }, 400);

      return mockResponse({
        id: invite.id,
        organizationId: invite.organization_id,
        invitedEmail: invite.invited_email,
        invitedName: invite.invited_name,
        role: invite.role,
        token: invite.token,
        status: invite.status,
        createdAt: invite.created_at,
        expiresAt: invite.expires_at
      }, 201);
    }

    // 7. ACCEPT AN INVITE
    if (pathname === "/api/organizations/invites/accept" && method === "POST") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Você precisa estar logado para aceitar um convite." }, 401);

      const { token } = body;
      if (!token) return mockResponse({ error: "Token de convite é obrigatório." }, 400);

      const { data: invite, error: invErr } = await supabase
        .from("organization_invites")
        .select("*")
        .eq("token", token)
        .eq("status", "pending")
        .maybeSingle();

      if (invErr || !invite) {
        return mockResponse({ error: "Convite inválido, expirado ou já aceito." }, 400);
      }

      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        await supabase.from("organization_invites").update({ status: "expired" }).eq("id", invite.id);
        return mockResponse({ error: "Este convite expirou." }, 400);
      }

      const { error: memErr } = await supabase
        .from("organization_members")
        .insert({
          organization_id: invite.organization_id,
          user_id: session.user.id,
          name: session.user.user_metadata?.name || "",
          email: session.user.email,
          role: invite.role,
          status: "active"
        });

      if (memErr && !memErr.message.includes("unique_org_user")) {
        return mockResponse({ error: "Erro ao se associar à organização: " + memErr.message }, 400);
      }

      await supabase
        .from("organization_invites")
        .update({
          status: "accepted",
          accepted_by: session.user.id,
          accepted_at: new Date().toISOString()
        })
        .eq("id", invite.id);

      await supabase
        .from("profiles")
        .update({
          default_organization_id: invite.organization_id,
          account_type: "agency",
          current_role: invite.role,
          onboarding_completed: true
        })
        .eq("id", session.user.id);

      return mockResponse({ success: true, organizationId: invite.organization_id });
    }

    // 8. CLIENT/LEAD TRANSFER FUNCTION
    if (pathname === "/api/clients/transfer" && method === "POST") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);

      const { clientIds, targetBrokerId, organizationId } = body;
      if (!clientIds || !Array.isArray(clientIds) || !targetBrokerId) {
        return mockResponse({ error: "Parâmetros inválidos para transferência" }, 400);
      }

      const { data: brokerMember } = await supabase
        .from("organization_members")
        .select("name, email")
        .eq("user_id", targetBrokerId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      const brokerName = brokerMember?.name || "Outro Corretor";

      for (const clientId of clientIds) {
        const { data: client } = await supabase
          .from("clients")
          .select("history")
          .eq("id", clientId)
          .maybeSingle();

        const history = client?.history || [];
        const newHistory = [
          ...history,
          {
            id: Math.random().toString(36).substring(2, 11),
            type: "transfer",
            date: new Date().toISOString(),
            description: `Lead transferido para o corretor responsável ${brokerName}.`,
            userName: session.user.user_metadata?.name || session.user.email || "Administrador"
          }
        ];

        await supabase
          .from("clients")
          .update({
            assigned_to: targetBrokerId,
            history: newHistory
          })
          .eq("id", clientId)
          .eq("organization_id", organizationId);
      }

      return mockResponse({ success: true, count: clientIds.length });
    }

    // 3. IMAGE UPLOAD via Supabase Storage
    if (pathname === "/api/upload") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);

      const dataUrl = body?.dataUrl;
      if (!dataUrl) {
        return mockResponse({ error: "Nenhum arquivo enviado" }, 400);
      }

      try {
        const arr = dataUrl.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
        
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(mime)) {
          return mockResponse({ error: "Apenas imagens nos formatos JPG, JPEG, PNG ou WEBP são permitidas." }, 400);
        }

        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });

        const maxSizeBytes = 5 * 1024 * 1024;
        if (blob.size > maxSizeBytes) {
          return mockResponse({ error: "O tamanho da imagem não deve exceder 5MB." }, 400);
        }

        const extension = mime.split('/')[1] || 'jpg';
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extension}`;
        const path = `users/${session.user.id}/properties/new-property/${filename}`;

        const { data, error: uploadError } = await supabase.storage
          .from('property-images')
          .upload(path, blob, {
            contentType: mime,
            upsert: true
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('property-images')
          .getPublicUrl(path);

        return mockResponse({ url: publicUrl });
      } catch (err: any) {
        console.error("Erro no upload de imagem:", err);
        return mockResponse({ error: `Falha no upload: ${err.message}` }, 400);
      }
    }

    // 4. PROPERTIES (IMÓVEIS)
    if (pathname === "/api/properties") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse([], 401);

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;

      if (method === "GET") {
        let query = supabase.from("properties").select("*");
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }
        
        const modality = searchParams.get("modality");
        const search = searchParams.get("search");

        if (modality && modality !== "Todos") {
          query = query.eq("modality", modality);
        }

        const { data, error } = await query;
        if (error) return mockResponse({ error: error.message }, 400);

        let mapped = (data || []).map(row => propertyFromDb(row));
        if (search) {
          const q = search.toLowerCase();
          mapped = mapped.filter((p: any) =>
            p.title?.toLowerCase().includes(q) ||
            p.neighborhood?.toLowerCase().includes(q) ||
            p.city?.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q)
          );
        }
        mapped.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return mockResponse(mapped);
      } else if (method === "POST") {
        if (activeOrgId) {
          const planCheck = await checkPlanLimit(activeOrgId, "properties");
          if (!planCheck.allowed) {
            return mockResponse({ error: planCheck.error }, 403);
          }
        }

        const code = `IM-${Math.floor(1000 + Math.random() * 9000)}`;
        const newProp = {
          ...body,
          userId: session.user.id,
          organization_id: activeOrgId || null,
          assigned_to: body.assigned_to || body.assignedTo || session.user.id,
          code
        };
        delete newProp.id;
        delete newProp._id;

        const dbPayload = propertyToDb(newProp);
        const { data, error } = await supabase
          .from("properties")
          .insert(dbPayload)
          .select()
          .single();

        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse(propertyFromDb(data), 201);
      }
    }

    const propMatch = pathname.match(/^\/api\/properties\/([^\/]+)$/);
    if (propMatch) {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);
      const id = propMatch[1];

      if (!isValidUuid(id)) {
        if (method === "GET") {
          return mockResponse({ error: "Imóvel não encontrado" }, 404);
        } else if (method === "PUT") {
          return mockResponse({ ...body, id, updatedAt: new Date().toISOString() });
        } else if (method === "DELETE") {
          return mockResponse({ success: true, message: "Imóvel excluído com sucesso (local)." });
        }
      }

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;

      if (method === "GET") {
        let query = supabase.from("properties").select("*").eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }
        
        const { data, error } = await query.single();
        if (error) return mockResponse({ error: "Imóvel não encontrado" }, 404);
        return mockResponse(propertyFromDb(data));
      } else if (method === "PUT") {
        const updateData = { ...body };
        delete updateData.id;
        delete updateData._id;
        delete updateData.userId;
        delete updateData.user_id;

        const dbPayload = propertyToDb(updateData);
        let query = supabase.from("properties").update(dbPayload).eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data, error } = await query.select().single();
        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse(propertyFromDb(data));
      } else if (method === "DELETE") {
        const { data: property, error: fetchErr } = await supabase
          .from("properties")
          .select("id, userId, organization_id")
          .eq("id", id)
          .maybeSingle();

        if (fetchErr) {
          return mockResponse({ error: `Erro ao verificar imóvel: ${fetchErr.message}` }, 400);
        }
        if (!property) {
          return mockResponse({ error: "Imóvel não encontrado." }, 404);
        }

        if (activeOrgId) {
          if (property.organization_id !== activeOrgId) {
            return mockResponse({ error: "Você não tem autorização para excluir este imóvel." }, 403);
          }
        } else {
          if (property.userId !== session.user.id) {
            return mockResponse({ error: "Você não tem autorização para excluir este imóvel." }, 403);
          }
        }

        let query = supabase.from("properties").delete().eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { error } = await query;
        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse({ success: true });
      }
    }

    // 5. CLIENTS (CLIENTES)
    if (pathname === "/api/clients") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse([], 401);

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id, current_role, name").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;
      const userRole = activeOrgId ? (activeOrgId === profile?.default_organization_id ? profile?.current_role : await getOrgMemberRole(activeOrgId, session.user.id)) : null;

      if (method === "GET") {
        let query = supabase.from("clients").select("*");
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
          if (userRole === "broker") {
            query = query.or(`assigned_to.eq.${session.user.id},user_id.eq.${session.user.id}`);
          }
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data, error } = await query;
        if (error) {
          console.error("Client GET list error from Supabase:", error);
          return mockResponse({ error: error.message }, 400);
        }
        
        const mappedClients = (data || []).map(row => clientFromDb(row));
        const sorted = mappedClients.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return mockResponse(sorted);
      } else if (method === "POST") {
        if (activeOrgId) {
          const planCheck = await checkPlanLimit(activeOrgId, "clients");
          if (!planCheck.allowed) {
            return mockResponse({ error: planCheck.error }, 403);
          }
        }

        const userName = profile?.name || session.user.email || "Corretor";

        const newClientInput = {
          ...body,
          userId: session.user.id,
          organization_id: activeOrgId || null,
          assigned_to: body.assigned_to || body.assignedTo || session.user.id,
          status: body.status || "Novo",
          history: body.history || [
            {
              id: Math.random().toString(36).substring(2, 11),
              type: "creation",
              date: new Date().toISOString(),
              description: "Lead criado no sistema",
              userName
            }
          ]
        };
        delete newClientInput.id;
        delete newClientInput._id;

        const dbPayload = clientToDb(newClientInput);
        console.log("Client POST payload to Supabase:", dbPayload);

        const { data, error } = await supabase
          .from("clients")
          .insert(dbPayload)
          .select()
          .maybeSingle();

        if (error) {
          console.error("Client POST error from Supabase:", error);
          return mockResponse({ error: error.message }, 400);
        }

        const returnedClient = clientFromDb(data);
        console.log("Client POST returned from Supabase after mapping:", returnedClient);
        return mockResponse(returnedClient, 201);
      }
    }

    const clientMatch = pathname.match(/^\/api\/clients\/([^\/]+)$/);
    if (clientMatch) {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);
      const id = clientMatch[1];

      if (!isValidUuid(id)) {
        if (method === "GET") {
          return mockResponse({ error: "Cliente não encontrado" }, 404);
        } else if (method === "PUT") {
          return mockResponse({ ...body, id, updatedAt: new Date().toISOString() });
        } else if (method === "DELETE") {
          return mockResponse({ success: true, message: "Cliente excluído com sucesso (local)." });
        }
      }

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id, name").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;

      if (method === "GET") {
        let query = supabase.from("clients").select("*").eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
          console.error("Client GET detail error from Supabase:", error);
          return mockResponse({ error: "Cliente não encontrado ou erro" }, 404);
        }
        if (!data) return mockResponse({ error: "Cliente não encontrado" }, 404);
        return mockResponse(clientFromDb(data));
      } else if (method === "PUT") {
        let query = supabase.from("clients").select("*").eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data: rawOldClient, error: fetchErr } = await query.maybeSingle();
        if (fetchErr || !rawOldClient) {
          console.error("Client PUT fetch error from Supabase:", fetchErr);
          return mockResponse({ error: "Cliente não encontrado para edição" }, 404);
        }

        const oldClient = clientFromDb(rawOldClient);
        const userName = profile?.name || session.user.email || "Corretor";

        const existingHistory = body.history || oldClient.history || [
          {
            id: Math.random().toString(36).substring(2, 11),
            type: "creation",
            date: oldClient.createdAt || new Date().toISOString(),
            description: "Lead criado no sistema",
            userName
          }
        ];

        const additionalEntries = [];
        if (body.status !== undefined && body.status !== oldClient.status) {
          additionalEntries.push({
            id: Math.random().toString(36).substring(2, 11),
            type: "status_change",
            date: new Date().toISOString(),
            description: `Status alterado de "${oldClient.status || "Sem Status"}" para "${body.status}"`,
            userName
          });
        }

        if (body.pipelineStatus !== undefined && body.pipelineStatus !== oldClient.pipelineStatus) {
          additionalEntries.push({
            id: Math.random().toString(36).substring(2, 11),
            type: "pipeline_change",
            date: new Date().toISOString(),
            description: `Etapa do pipeline alterada de "${oldClient.pipelineStatus || "Sem etapa"}" para "${body.pipelineStatus}"`,
            userName
          });
        }

        if (
          (body.status === "Perdido" || body.pipelineStatus === "Perdido") &&
          body.lossReason &&
          body.lossReason !== oldClient.lossReason
        ) {
          additionalEntries.push({
            id: Math.random().toString(36).substring(2, 11),
            type: "loss",
            date: new Date().toISOString(),
            description: `Motivo de perda registrado: "${body.lossReason}"`,
            userName
          });
        }

        let finalHistory = existingHistory;
        if (additionalEntries.length > 0) {
          finalHistory = [...existingHistory, ...additionalEntries];
        }

        const updateData = {
          ...body,
          history: finalHistory
        };
        delete updateData.id;
        delete updateData._id;
        delete updateData.userId;
        delete updateData.user_id;

        const dbPayload = clientToDb(updateData);
        console.log("Client PUT payload to Supabase:", dbPayload);

        let updateQuery = supabase.from("clients").update(dbPayload).eq("id", id);
        if (activeOrgId) {
          updateQuery = updateQuery.eq("organization_id", activeOrgId);
        } else {
          updateQuery = updateQuery.eq("userId", session.user.id);
        }

        const { data, error } = await updateQuery.select().maybeSingle();
        if (error) {
          console.error("Client PUT error from Supabase:", error);
          return mockResponse({ error: error.message }, 400);
        }

        const returnedClient = clientFromDb(data);
        console.log("Client PUT returned from Supabase after mapping:", returnedClient);
        return mockResponse(returnedClient);
      } else if (method === "DELETE") {
        if (!id) {
          return mockResponse({ error: "ID do cliente não informado." }, 400);
        }

        // Fetch client to verify existence and ownership
        const { data: client, error: fetchErr } = await supabase
          .from("clients")
          .select("id, userId, organization_id, assigned_to")
          .eq("id", id)
          .maybeSingle();

        if (fetchErr) {
          return mockResponse({ error: `Erro ao buscar cliente: ${fetchErr.message}` }, 400);
        }
        if (!client) {
          return mockResponse({ error: "Cliente não encontrado." }, 404);
        }

        // Verify ownership/authorization
        if (activeOrgId) {
          if (client.organization_id !== activeOrgId) {
            return mockResponse({ error: "Você não tem autorização para excluir este cliente." }, 403);
          }
          const userRole = await getOrgMemberRole(activeOrgId, session.user.id);
          const isManagerOrHigher = userRole && ["owner", "admin", "manager"].includes(userRole);
          const isCreator = client.userId === session.user.id;
          const isAssigned = client.assigned_to === session.user.id;

          if (!isManagerOrHigher && !isCreator && !isAssigned) {
            return mockResponse({ error: "Você não tem autorização para excluir este cliente." }, 403);
          }
        } else {
          if (client.userId !== session.user.id) {
            return mockResponse({ error: "Você não tem autorização para excluir este cliente." }, 403);
          }
        }

        console.log("[DELETE CLIENT] Real Supabase RPC path", id);

        const { data, error } = await supabase.rpc("delete_client_cascade", {
          p_client_id: id,
        });

        if (error) {
          console.error("Client DELETE RPC error:", error);
          const errMsg = error.message || "";
          if (errMsg.includes("Client not found")) {
            return mockResponse({ error: "Cliente não encontrado." }, 404);
          }
          if (errMsg.includes("Access denied") || errMsg.includes("permission") || errMsg.includes("authorized")) {
            return mockResponse({ error: "Você não tem autorização para excluir este cliente." }, 403);
          }
          return mockResponse({
            error: error.message || "Erro ao excluir cliente no Supabase."
          }, 400);
        }

        if (!data?.success) {
          return mockResponse({
            error: "A exclusão não foi confirmada pelo banco de dados."
          }, 400);
        }

        return mockResponse({
          success: true,
          deletedId: data.deletedId || id
        });
      }
    }

    // 6. PROPOSALS (PROPOSTAS)
    if (pathname === "/api/proposals") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse([], 401);

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id, current_role").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;
      const userRole = activeOrgId ? (activeOrgId === profile?.default_organization_id ? profile?.current_role : await getOrgMemberRole(activeOrgId, session.user.id)) : null;

      if (method === "GET") {
        let query = supabase.from("proposals").select("*");
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
          if (userRole === "broker") {
            query = query.or(`assigned_to.eq.${session.user.id},user_id.eq.${session.user.id}`);
          }
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data, error } = await query;
        if (error) return mockResponse({ error: error.message }, 400);
        const mapped = (data || []).map(row => proposalFromDb(row));
        const sorted = mapped.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return mockResponse(sorted);
      } else if (method === "POST") {
        const newProposal = {
          ...body,
          userId: session.user.id,
          organization_id: activeOrgId || null,
          assigned_to: body.assigned_to || body.assignedTo || session.user.id
        };
        delete newProposal.id;
        delete newProposal._id;

        const dbPayload = proposalToDb(newProposal);
        const { data, error } = await supabase
          .from("proposals")
          .insert(dbPayload)
          .select()
          .single();

        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse(proposalFromDb(data), 201);
      }
    }

    const proposalMatch = pathname.match(/^\/api\/proposals\/([^\/]+)$/);
    if (proposalMatch) {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);
      const id = proposalMatch[1];

      if (!isValidUuid(id)) {
        if (method === "GET") {
          return mockResponse({ error: "Proposta não encontrada" }, 404);
        } else if (method === "PUT") {
          return mockResponse({ ...body, id, updatedAt: new Date().toISOString() });
        } else if (method === "DELETE") {
          return mockResponse({ success: true, message: "Proposta excluída com sucesso (local)." });
        }
      }

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;

      if (method === "PUT") {
        const updateData = { ...body };
        delete updateData.id;
        delete updateData._id;
        delete updateData.userId;
        delete updateData.user_id;

        const dbPayload = proposalToDb(updateData);
        let query = supabase.from("proposals").update(dbPayload).eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data, error } = await query.select().single();
        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse(proposalFromDb(data));
      } else if (method === "DELETE") {
        const { data: proposal, error: fetchErr } = await supabase
          .from("proposals")
          .select("id, userId, organization_id")
          .eq("id", id)
          .maybeSingle();

        if (fetchErr) {
          return mockResponse({ error: `Erro ao verificar proposta: ${fetchErr.message}` }, 400);
        }
        if (!proposal) {
          return mockResponse({ error: "Proposta não encontrada." }, 404);
        }

        if (activeOrgId) {
          if (proposal.organization_id !== activeOrgId) {
            return mockResponse({ error: "Você não tem autorização para excluir esta proposta." }, 403);
          }
        } else {
          if (proposal.userId !== session.user.id) {
            return mockResponse({ error: "Você não tem autorização para excluir esta proposta." }, 403);
          }
        }

        let query = supabase.from("proposals").delete().eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { error } = await query;
        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse({ success: true });
      }
    }

    // 7. VISITS (VISITAS)
    if (pathname === "/api/visits") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse([], 401);

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id, current_role").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;
      const userRole = activeOrgId ? (activeOrgId === profile?.default_organization_id ? profile?.current_role : await getOrgMemberRole(activeOrgId, session.user.id)) : null;

      if (method === "GET") {
        let query = supabase.from("visits").select("*");
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
          if (userRole === "broker") {
            query = query.or(`assigned_to.eq.${session.user.id},user_id.eq.${session.user.id}`);
          }
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data, error } = await query;
        if (error) return mockResponse({ error: error.message }, 400);
        const mapped = (data || []).map(row => visitFromDb(row));
        const sorted = mapped.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return mockResponse(sorted);
      } else if (method === "POST") {
        const newVisit = {
          ...body,
          userId: session.user.id,
          organization_id: activeOrgId || null,
          assigned_to: body.assigned_to || body.assignedTo || session.user.id
        };
        delete newVisit.id;
        delete newVisit._id;

        const dbPayload = visitToDb(newVisit);
        const { data, error } = await supabase
          .from("visits")
          .insert(dbPayload)
          .select()
          .single();

        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse(visitFromDb(data), 201);
      }
    }

    const visitMatch = pathname.match(/^\/api\/visits\/([^\/]+)$/);
    if (visitMatch) {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);
      const id = visitMatch[1];

      if (!isValidUuid(id)) {
        if (method === "GET") {
          return mockResponse({ error: "Visita não encontrada" }, 404);
        } else if (method === "PUT") {
          return mockResponse({ ...body, id, updatedAt: new Date().toISOString() });
        } else if (method === "DELETE") {
          return mockResponse({ success: true, message: "Visita excluída com sucesso (local)." });
        }
      }

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;

      if (method === "PUT") {
        const updateData = { ...body };
        delete updateData.id;
        delete updateData._id;
        delete updateData.userId;
        delete updateData.user_id;

        const dbPayload = visitToDb(updateData);
        let query = supabase.from("visits").update(dbPayload).eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data, error } = await query.select().single();
        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse(visitFromDb(data));
      } else if (method === "DELETE") {
        const { data: visit, error: fetchErr } = await supabase
          .from("visits")
          .select("id, userId, organization_id")
          .eq("id", id)
          .maybeSingle();

        if (fetchErr) {
          return mockResponse({ error: `Erro ao verificar visita: ${fetchErr.message}` }, 400);
        }
        if (!visit) {
          return mockResponse({ error: "Visita não encontrada." }, 404);
        }

        if (activeOrgId) {
          if (visit.organization_id !== activeOrgId) {
            return mockResponse({ error: "Você não tem autorização para excluir esta visita." }, 403);
          }
        } else {
          if (visit.userId !== session.user.id) {
            return mockResponse({ error: "Você não tem autorização para excluir esta visita." }, 403);
          }
        }

        let query = supabase.from("visits").delete().eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { error } = await query;
        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse({ success: true });
      }
    }

    // 8. TASKS (TAREFAS)
    if (pathname === "/api/tasks") {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse([], 401);

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id, current_role").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;
      const userRole = activeOrgId ? (activeOrgId === profile?.default_organization_id ? profile?.current_role : await getOrgMemberRole(activeOrgId, session.user.id)) : null;

      if (method === "GET") {
        let query = supabase.from("tasks").select("*");
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
          if (userRole === "broker") {
            query = query.or("assigned_to.eq." + session.user.id + ",user_id.eq." + session.user.id);
          }
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data, error } = await query;
        if (error) return mockResponse({ error: error.message }, 400);
        const mapped = (data || []).map(row => taskFromDb(row));
        const sorted = mapped.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return mockResponse(sorted);
      } else if (method === "POST") {
        const newTask = {
          ...body,
          userId: session.user.id,
          organization_id: activeOrgId || null,
          assigned_to: body.assigned_to || body.assignedTo || session.user.id
        };
        delete newTask.id;
        delete newTask._id;

        const dbPayload = taskToDb(newTask);
        const { data, error } = await supabase
          .from("tasks")
          .insert(dbPayload)
          .select()
          .single();

        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse(taskFromDb(data), 201);
      }
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([^\/]+)$/);
    if (taskMatch) {
      const session = await getActiveUserSession();
      if (!session?.user) return mockResponse({ error: "Não autorizado" }, 401);
      const id = taskMatch[1];

      if (!isValidUuid(id)) {
        if (method === "GET") {
          return mockResponse({ error: "Tarefa não encontrada" }, 404);
        } else if (method === "PUT") {
          return mockResponse({ ...body, id, updatedAt: new Date().toISOString() });
        } else if (method === "DELETE") {
          return mockResponse({ success: true, message: "Tarefa excluída com sucesso (local)." });
        }
      }

      const headerOrgId = (init?.headers as any)?.["X-Organization-Id"] || (init?.headers as any)?.["x-organization-id"];
      const { data: profile } = await supabase.from("profiles").select("default_organization_id").eq("id", session.user.id).maybeSingle();
      const activeOrgId = headerOrgId || profile?.default_organization_id;

      if (method === "PUT") {
        const updateData = { ...body };
        delete updateData.id;
        delete updateData._id;
        delete updateData.userId;
        delete updateData.user_id;

        const dbPayload = taskToDb(updateData);
        let query = supabase.from("tasks").update(dbPayload).eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { data, error } = await query.select().single();
        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse(taskFromDb(data));
      } else if (method === "DELETE") {
        const { data: task, error: fetchErr } = await supabase
          .from("tasks")
          .select("id, userId, organization_id")
          .eq("id", id)
          .maybeSingle();

        if (fetchErr) {
          return mockResponse({ error: `Erro ao verificar tarefa: ${fetchErr.message}` }, 400);
        }
        if (!task) {
          return mockResponse({ error: "Tarefa não encontrada." }, 404);
        }

        if (activeOrgId) {
          if (task.organization_id !== activeOrgId) {
            return mockResponse({ error: "Você não tem autorização para excluir esta tarefa." }, 403);
          }
        } else {
          if (task.userId !== session.user.id) {
            return mockResponse({ error: "Você não tem autorização para excluir esta tarefa." }, 403);
          }
        }

        let query = supabase.from("tasks").delete().eq("id", id);
        if (activeOrgId) {
          query = query.eq("organization_id", activeOrgId);
        } else {
          query = query.eq("userId", session.user.id);
        }

        const { error } = await query;
        if (error) return mockResponse({ error: error.message }, 400);
        return mockResponse({ success: true });
      }
    }

    return mockResponse({ error: "Endpoint não encontrado" }, 404);
  }

  // --- DEMO MODE ACTIVE: INTERCEPTING ALL API CALLS ---
  const method = (init?.method || "GET").toUpperCase();
  const urlObj = new URL(url, "http://localhost");
  const pathname = urlObj.pathname;
  const searchParams = urlObj.searchParams;

  let body: any = null;
  if (init?.body) {
    try {
      body = JSON.parse(init.body as string);
    } catch (e) {
      // body is not JSON
    }
  }

  // Helper to get active user details
  const getDemoUser = () => {
    const saved = localStorage.getItem("vega_crm_user");
    return saved ? JSON.parse(saved) : { name: "Carlos Brito", username: "carlos_demo" };
  };

  // 1. SYSTEM STATUS
  if (pathname === "/api/status") {
    return mockResponse({
      dbType: "Demonstração Offline Local",
      supabaseActive: false,
      geminiActive: true
    });
  }

  // 2. DEMO RESET ENDPOINT
  if (pathname === "/api/demo/reset") {
    localStorage.removeItem("demo_properties");
    localStorage.removeItem("demo_clients");
    localStorage.removeItem("demo_proposals");
    localStorage.removeItem("demo_visits");
    localStorage.removeItem("demo_tasks");

    // Pre-initialize fresh demo data
    getLocalData("demo_properties", getInitialProps);
    getLocalData("demo_clients", getInitialClients);
    getLocalData("demo_proposals", getInitialProposals);
    getLocalData("demo_visits", getInitialVisits);
    getLocalData("demo_tasks", getInitialTasks);

    return mockResponse({ success: true, message: "Dados de demonstração resetados com sucesso!" });
  }

  // ORGANIZATIONS DEMO HANDLER
  if (pathname === "/api/organizations") {
    if (method === "GET") {
      return mockResponse([{
        id: "demo-org-id",
        name: "Metria Negócios Imobiliários (Demo)",
        tradeName: "Metria Demo",
        creci: "1234",
        phone: "38988314834",
        email: "demo@metriacrm.com.br",
        city: "Uberlândia",
        state: "MG",
        ownerId: "demo-user-id",
        plan: "max",
        userRole: "owner",
        userStatus: "active"
      }]);
    } else if (method === "POST") {
      return mockResponse({
        id: "demo-org-id",
        name: body?.name || "Metria Negócios Imobiliários (Demo)",
        tradeName: body?.tradeName || "Metria Demo",
        creci: body?.creci || "1234",
        phone: body?.phone || "38988314834",
        email: body?.email || "demo@metriacrm.com.br",
        city: body?.city || "Uberlândia",
        state: body?.state || "MG",
        ownerId: "demo-user-id",
        plan: body?.plan || "max",
        userRole: "owner"
      }, 201);
    }
  }

  // 3. PROPERTIES
  if (pathname === "/api/properties") {
    const list = getLocalData("demo_properties", getInitialProps);
    if (method === "GET") {
      const modality = searchParams.get("modality");
      const search = searchParams.get("search");
      let filtered = [...list];

      if (modality && modality !== "Todos") {
        filtered = filtered.filter((p: any) => p.modality?.toLowerCase() === modality.toLowerCase());
      }
      if (search) {
        const query = search.toLowerCase();
        filtered = filtered.filter((p: any) => 
          p.title?.toLowerCase().includes(query) ||
          p.neighborhood?.toLowerCase().includes(query) ||
          p.city?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
        );
      }
      return mockResponse(filtered);
    } else if (method === "POST") {
      const newProp = {
        ...body,
        id: `demo-prop-${Date.now()}`,
        code: `IM-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: new Date().toISOString()
      };
      list.unshift(newProp);
      saveLocalData("demo_properties", list);
      return mockResponse(newProp, 201);
    }
  }

  const propMatch = pathname.match(/^\/api\/properties\/([^\/]+)$/);
  if (propMatch) {
    const id = propMatch[1];
    const list = getLocalData("demo_properties", getInitialProps);
    if (method === "GET") {
      const item = list.find((p: any) => p.id === id || p._id === id);
      return item ? mockResponse(item) : mockResponse({ error: "Imóvel não encontrado" }, 404);
    } else if (method === "PUT") {
      const index = list.findIndex((p: any) => p.id === id || p._id === id);
      let updated = body;
      if (index !== -1) {
        updated = { ...list[index], ...body, id };
        list[index] = updated;
        saveLocalData("demo_properties", list);
      }
      return mockResponse(updated);
    } else if (method === "DELETE") {
      const updatedList = list.filter((p: any) => p.id !== id && p._id !== id);
      saveLocalData("demo_properties", updatedList);
      return mockResponse({ success: true });
    }
  }

  // 4. CLIENTS
  if (pathname === "/api/clients") {
    const list = getLocalData("demo_clients", getInitialClients);
    if (method === "GET") {
      return mockResponse(list);
    } else if (method === "POST") {
      const newClient = {
        ...body,
        id: `demo-client-${Date.now()}`,
        status: body.status || "Novo",
        createdAt: body.createdAt || new Date().toISOString(),
        history: body.history || [
          {
            id: Math.random().toString(36).substring(2, 11),
            type: "creation",
            date: new Date().toISOString(),
            description: "Lead criado no sistema",
            userName: getDemoUser().name
          }
        ]
      };
      list.unshift(newClient);
      saveLocalData("demo_clients", list);
      return mockResponse(newClient, 201);
    }
  }

  const clientMatch = pathname.match(/^\/api\/clients\/([^\/]+)$/);
  if (clientMatch) {
    const id = clientMatch[1];
    const list = getLocalData("demo_clients", getInitialClients);
    if (method === "GET") {
      const item = list.find((c: any) => c.id === id || c._id === id);
      return item ? mockResponse(item) : mockResponse({ error: "Cliente não encontrado" }, 404);
    } else if (method === "PUT") {
      const index = list.findIndex((c: any) => c.id === id || c._id === id);
      let updated = body;
      if (index !== -1) {
        const oldClient = list[index];
        const userName = getDemoUser().name;
        
        // Dynamic audit trail history logging
        const existingHistory = body.history || oldClient.history || [
          {
            id: Math.random().toString(36).substring(2, 11),
            type: "creation",
            date: oldClient.createdAt || new Date().toISOString(),
            description: "Lead criado no sistema"
          }
        ];

        const additionalEntries = [];

        if (body.status !== undefined && body.status !== oldClient.status) {
          additionalEntries.push({
            id: Math.random().toString(36).substring(2, 11),
            type: "status_change",
            date: new Date().toISOString(),
            description: `Status alterado de "${oldClient.status || "Sem Status"}" para "${body.status}"`,
            userName
          });
        }

        if (body.pipelineStatus !== undefined && body.pipelineStatus !== oldClient.pipelineStatus) {
          additionalEntries.push({
            id: Math.random().toString(36).substring(2, 11),
            type: "pipeline_change",
            date: new Date().toISOString(),
            description: `Etapa do pipeline alterada de "${oldClient.pipelineStatus || "Sem etapa"}" para "${body.pipelineStatus}"`,
            userName
          });
        }

        if (
          (body.status === "Perdido" || body.pipelineStatus === "Perdido") &&
          body.lossReason &&
          body.lossReason !== oldClient.lossReason
        ) {
          additionalEntries.push({
            id: Math.random().toString(36).substring(2, 11),
            type: "loss",
            date: new Date().toISOString(),
            description: `Motivo de perda registrado: "${body.lossReason}"`,
            userName
          });
        }

        let finalHistory = existingHistory;
        if (additionalEntries.length > 0) {
          finalHistory = [...existingHistory, ...additionalEntries];
        }

        updated = { ...oldClient, ...body, id, history: finalHistory, updatedAt: new Date().toISOString() };
        list[index] = updated;
        saveLocalData("demo_clients", list);
      }
      return mockResponse(updated);
    } else if (method === "DELETE") {
      if (!id) {
        return mockResponse({ error: "ID do cliente não informado." }, 400);
      }

      console.log("[DELETE CLIENT] Demo/offline path", id);
      console.log("[Demo Mode] Deleting client and linked records for id:", id);

      // Delete demo tasks linked to client
      try {
        const tasksList = getLocalData("demo_tasks", () => []);
        const updatedTasks = tasksList.filter((t: any) => t.clientId !== id);
        saveLocalData("demo_tasks", updatedTasks);
      } catch (err) {
        console.warn("[Demo Mode] Falha ao excluir tarefas vinculadas:", err);
      }

      // Delete demo visits linked to client
      try {
        const visitsList = getLocalData("demo_visits", () => []);
        const updatedVisits = visitsList.filter((v: any) => v.clientId !== id);
        saveLocalData("demo_visits", updatedVisits);
      } catch (err) {
        console.warn("[Demo Mode] Falha ao excluir visitas vinculadas:", err);
      }

      // Delete demo proposals linked to client
      try {
        const proposalsList = getLocalData("demo_proposals", () => []);
        const updatedProposals = proposalsList.filter((p: any) => p.clientId !== id);
        saveLocalData("demo_proposals", updatedProposals);
      } catch (err) {
        console.warn("[Demo Mode] Falha ao excluir propostas vinculadas:", err);
      }

      // Delete the client
      const updatedList = list.filter((c: any) => c.id !== id && c._id !== id);
      saveLocalData("demo_clients", updatedList);

      return mockResponse({ success: true, deletedId: id });
    }
  }

  // 5. PROPOSALS
  if (pathname === "/api/proposals") {
    const list = getLocalData("demo_proposals", getInitialProposals);
    if (method === "GET") {
      return mockResponse(list);
    } else if (method === "POST") {
      const newProposal = {
        ...body,
        id: `demo-proposal-${Date.now()}`,
        createdAt: new Date().toISOString()
      };
      list.unshift(newProposal);
      saveLocalData("demo_proposals", list);
      return mockResponse(newProposal, 201);
    }
  }

  const proposalMatch = pathname.match(/^\/api\/proposals\/([^\/]+)$/);
  if (proposalMatch) {
    const id = proposalMatch[1];
    const list = getLocalData("demo_proposals", getInitialProposals);
    if (method === "PUT") {
      const index = list.findIndex((p: any) => p.id === id || p._id === id);
      let updated = body;
      if (index !== -1) {
        updated = { ...list[index], ...body, id };
        list[index] = updated;
        saveLocalData("demo_proposals", list);
      }
      return mockResponse(updated);
    } else if (method === "DELETE") {
      const updatedList = list.filter((p: any) => p.id !== id && p._id !== id);
      saveLocalData("demo_proposals", updatedList);
      return mockResponse({ success: true });
    }
  }

  // 6. VISITS
  if (pathname === "/api/visits") {
    const list = getLocalData("demo_visits", getInitialVisits);
    if (method === "GET") {
      return mockResponse(list);
    } else if (method === "POST") {
      const newVisit = {
        ...body,
        id: `demo-visit-${Date.now()}`,
        createdAt: new Date().toISOString()
      };
      list.unshift(newVisit);
      saveLocalData("demo_visits", list);
      return mockResponse(newVisit, 201);
    }
  }

  const visitMatch = pathname.match(/^\/api\/visits\/([^\/]+)$/);
  if (visitMatch) {
    const id = visitMatch[1];
    const list = getLocalData("demo_visits", getInitialVisits);
    if (method === "PUT") {
      const index = list.findIndex((v: any) => v.id === id || v._id === id);
      let updated = body;
      if (index !== -1) {
        updated = { ...list[index], ...body, id };
        list[index] = updated;
        saveLocalData("demo_visits", list);
      }
      return mockResponse(updated);
    } else if (method === "DELETE") {
      const updatedList = list.filter((v: any) => v.id !== id && v._id !== id);
      saveLocalData("demo_visits", updatedList);
      return mockResponse({ success: true });
    }
  }

  // 7. TASKS
  if (pathname === "/api/tasks") {
    const list = getLocalData("demo_tasks", getInitialTasks);
    if (method === "GET") {
      return mockResponse(list);
    } else if (method === "POST") {
      const newTask = {
        ...body,
        id: `demo-task-${Date.now()}`,
        createdAt: new Date().toISOString()
      };
      list.unshift(newTask);
      saveLocalData("demo_tasks", list);
      return mockResponse(newTask, 201);
    }
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^\/]+)$/);
  if (taskMatch) {
    const id = taskMatch[1];
    const list = getLocalData("demo_tasks", getInitialTasks);
    if (method === "PUT") {
      const index = list.findIndex((t: any) => t.id === id || t._id === id);
      let updated = body;
      if (index !== -1) {
        updated = { ...list[index], ...body, id };
        list[index] = updated;
        saveLocalData("demo_tasks", list);
      }
      return mockResponse(updated);
    } else if (method === "DELETE") {
      const updatedList = list.filter((t: any) => t.id !== id && t._id !== id);
      saveLocalData("demo_tasks", updatedList);
      return mockResponse({ success: true });
    }
  }

  // 8. PROFILE / AUTH UPDATE
  const authMatch = pathname.match(/^\/api\/auth\/update\/([^\/]+)$/);
  if (authMatch) {
    const id = authMatch[1];
    const user = getDemoUser();
    const updatedUser = { ...user, ...body, id };
    localStorage.setItem("vega_crm_user", JSON.stringify(updatedUser));
    return mockResponse(updatedUser);
  }

  // 9. IMAGE UPLOAD
  if (pathname === "/api/upload") {
    return mockResponse({ url: body?.dataUrl || "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80" });
  }

  // 10. AI GENERATE PROPERTY DESCRIPTION
  if (pathname === "/api/ai/generate-description") {
    const { title, type, condition, modality, neighborhood, city, price, bedrooms, suites, bathrooms, parkingSpots, area, amenities } = body;
    const priceStr = price ? Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "Sob Consulta";
    const amenitiesStr = amenities && amenities.length > 0 ? amenities.join(", ") : "Lazer completo, segurança 24h";

    const professional = `Excelente oportunidade imobiliária em região valorizada. Apresentamos este primoroso ${type || "Imóvel"} de ${condition || "excelente estado"}, com acabamentos impecáveis e excelente aproveitamento de espaços. Situado no cobiçado bairro ${neighborhood || "Bairro Nobre"} de ${city || "Uberlândia"}, ele conta com ${area || 100}m² de área privativa muito bem distribuída. Dispõe de ${bedrooms || 3} dormitórios generosos, sendo ${suites || 1} suíte(s), ideal para garantir total privacidade e bem-estar. O condomínio oferece infraestrutura robusta incluindo: ${amenitiesStr}. Oferecido para ${modality || "Venda"} por apenas ${priceStr}. Agende sua visita e conheça todos os diferenciais!`;

    const whatsapp = `🚀 *OPORTUNIDADE DE OURO!* 🚀\n\nConfira esse espetacular *${type || "Imóvel"}* em *${neighborhood || "Bairro Nobre"}* (${city || "Uberlândia"})!\n\n✨ *Diferenciais de peso:*\n• Espaço: ${area || 100}m² de conforto total\n• Quartos: ${bedrooms || 3} amplos (${suites || 1} suíte privativa)\n• Vagas: ${parkingSpots || 1} vaga(s) reservada(s)\n• Lazer do condomínio: ${amenitiesStr}\n\n💵 *Preço Incrível:* ${priceStr}\n\nPerfeito para morar ou investir com alta rentabilidade. Fale comigo agora e agende sua visita! 📲`;

    const portal = `Diga olá para a sua nova conquista! Amplo e moderno ${type || "Imóvel"} de ${area || 100}m² privativos, em localização estratégica e privilegiada dentro do bairro ${neighborhood || "Bairro Nobre"}. Living acolhedor para dois ambientes com excelente iluminação natural, copa-cozinha equipada com excelentes armários planejados, área de serviços independente e ${parkingSpots || 1} vagas de garagem exclusivas. Planta versátil de ${bedrooms || 3} dormitórios com ${suites || 1} suíte acolhedora. Segurança 24 horas e lazer agradável (${amenitiesStr}). Oportunidade por ${priceStr}. Aceita financiamento bancário imediato.`;

    return mockResponse({ professional, whatsapp, portal });
  }

  // 11. AI SUGGEST TASKS
  if (pathname === "/api/ai/suggest-tasks") {
    const clientsList = getLocalData("demo_clients", getInitialClients);
    const marian = clientsList.find((c: any) => c.name.includes("Mariana")) || { name: "Mariana Alencar Silva" };
    const thiago = clientsList.find((c: any) => c.name.includes("Thiago")) || { name: "Thiago Vasconcelos" };
    const aline = clientsList.find((c: any) => c.name.includes("Aline")) || { name: "Aline Torres" };

    return mockResponse([
      {
        title: `Seguir com Mariana Alencar`,
        clientName: marian.name,
        description: "Oferecer a luxuosa Casa no Jardins Madri (Goiânia). Ela demonstrou alta qualificação e busca um condomínio fechado seguro para seus filhos.",
        time: "10:30",
        type: "FOLLOW-UP"
      },
      {
        title: `Minuta de contrato para Aline`,
        clientName: aline.name,
        description: "Entrar em contato para agilizar o envio das certidões negativas restantes e fechar a aprovação jurídica do aluguel comercial.",
        time: "14:15",
        type: "CONTRATO"
      },
      {
        title: `Marcar visita com Thiago`,
        clientName: thiago.name,
        description: "Apresentar a Cobertura Duplex no Jardim Botânico. Ele é investidor quente e busca um imóvel elegante com piscina privativa.",
        time: "16:45",
        type: "VISITA"
      }
    ]);
  }

  // 12. AI NEXT BEST ACTIONS ENGINE (algorithmic replication)
  if (pathname === "/api/ai/next-best-actions") {
    const clientsList = getLocalData("demo_clients", getInitialClients);
    const tasksList = getLocalData("demo_tasks", getInitialTasks);
    const proposalsList = getLocalData("demo_proposals", getInitialProposals);
    const visitsList = getLocalData("demo_visits", getInitialVisits);

    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const rawCandidates: any[] = [];

    // 12.1 Leads sem contato
    const leadsSemContato = clientsList.filter((c: any) => {
      const isNew = String(c.status || "").toLowerCase() === "novo" || String(c.profileType || "").toLowerCase() === "lead";
      const isActive = !["ganho", "perdido"].includes(String(c.status || "").toLowerCase());
      const hasCompletedTask = tasksList.some((t: any) => t.completed && (t.clientId === c.id || t.clientId === c._id));
      const hasHistoryContact = c.history?.some((h: any) => 
        ["whatsapp", "task_completed", "visit_scheduled", "proposal_sent"].includes(h.type)
      );
      return isNew && isActive && !hasCompletedTask && !hasHistoryContact;
    });

    leadsSemContato.forEach((c: any) => {
      rawCandidates.push({
        clientId: c.id || c._id,
        clientName: c.name,
        category: "Leads sem contato",
        reason: `Lead novo cadastrado no CRM sem nenhuma atividade ou primeiro contato registrado.`,
        suggestion: `Fazer primeiro contato via WhatsApp para se apresentar e entender o perfil de busca do cliente.`,
        actionType: "whatsapp",
        priority: "Alta",
        actionPayload: {
          phone: c.phone || "",
          message: `Olá, ${c.name.split(" ")[0]}! Tudo bem? Me chamo corretor da Metria CRM. Vi que você tem interesse em encontrar um imóvel. Gostaria de entender melhor quais são suas preferências (tipo de imóvel, localização, quantidade de quartos) para eu selecionar as melhores opções da nossa carteira para você. Como está o seu tempo esta semana?`,
          taskTitle: `Fazer primeiro contato com ${c.name}`,
          taskDescription: `Entrar em contato para qualificar as preferências do lead novo.`,
          taskType: "Ligar"
        }
      });
    });

    // Helper to format dates safely to DD/MM/YYYY
    const formatDateSafely = (dateVal: any) => {
      if (!dateVal || typeof dateVal !== "string") return "N/D";
      return dateVal.split("-").reverse().join("/");
    };

    // 12.2 Follow-ups atrasados
    const followupsAtrasados = tasksList.filter((t: any) => {
      if (t.completed) return false;
      if (!t.date) return false;
      if (t.date < todayStr) return true;
      if (t.date === todayStr && t.time && t.time < currentHM) return true;
      return false;
    });

    followupsAtrasados.forEach((t: any) => {
      const client = clientsList.find((c: any) => c.id === t.clientId || c._id === t.clientId || c.name === t.clientName);
      rawCandidates.push({
        clientId: client?.id || client?._id || "unknown",
        clientName: t.clientName,
        category: "Follow-ups atrasados",
        reason: `A tarefa de follow-up "${t.title}" está atrasada desde ${formatDateSafely(t.date)} às ${t.time || "N/D"}.`,
        suggestion: `Colocar a agenda em dia realizando o contato com o cliente para evitar o esfriamento da negociação.`,
        actionType: "whatsapp",
        priority: "Alta",
        actionPayload: {
          phone: client?.phone || "",
          message: `Olá, ${t.clientName.split(" ")[0]}! Espero que esteja bem. Estou entrando em contato para retomarmos nossa conversa sobre as opções de imóveis que estávamos analisando. Você conseguiu um tempo para dar uma olhada nelas?`,
          taskTitle: `Retomar follow-up: ${t.title}`,
          taskDescription: `Follow-up comercial anteriormente atrasado.`,
          taskType: "Cobrar retorno"
        }
      });
    });

    // 12.3 Propostas abertas
    const propostasAbertas = proposalsList.filter((p: any) => 
      ["pendente", "em análise", "em analise"].includes(String(p.status || "").toLowerCase())
    );

    propostasAbertas.forEach((p: any) => {
      const client = clientsList.find((c: any) => c.id === p.clientId || c._id === p.clientId || c.name === p.clientName);
      rawCandidates.push({
        clientId: p.clientId,
        clientName: p.clientName,
        category: "Propostas abertas",
        reason: `Há uma proposta em análise/pendente para o imóvel "${p.propertyTitle}" enviada em ${formatDateSafely(p.date)}.`,
        suggestion: `Entrar em contato para cobrar um posicionamento e dar andamento aos trâmites de fechamento do negócio.`,
        actionType: "whatsapp",
        priority: "Crítica",
        actionPayload: {
          phone: client?.phone || "",
          message: `Olá, ${p.clientName.split(" ")[0]}! Passando para saber se você teve alguma resposta ou conseguiu analisar a proposta que enviamos para o imóvel ${p.propertyTitle}? Ficou com alguma dúvida sobre as condições ou fluxo de pagamentos?`,
          taskTitle: `Cobrar proposta ${p.clientName}`,
          taskDescription: `Cobrar andamento da proposta de R$ ${p.proposedValue?.toLocaleString("pt-BR")} para o imóvel ${p.propertyTitle}`,
          taskType: "Enviar proposta"
        }
      });
    });

    // 12.4 Visitas realizadas sem retorno
    const visitasSemRetorno = visitsList.filter((v: any) => {
      if (String(v.status || "").toLowerCase() !== "realizada") return false;
      const hasFeedback = v.feedback && v.feedback.trim().length > 0;
      return !hasFeedback;
    });

    visitasSemRetorno.forEach((v: any) => {
      const client = clientsList.find((c: any) => c.id === v.clientId || c._id === v.clientId || v.name === v.clientName);
      rawCandidates.push({
        clientId: v.clientId,
        clientName: v.clientName,
        category: "Visitas realizadas sem feedback",
        reason: `A visita ao imóvel "${v.propertyTitle}" foi realizada no dia ${formatDateSafely(v.date)}, mas ainda não foi colhido feedback estruturado do cliente.`,
        suggestion: `Saber a opinião do cliente pós-visita para qualificar interesse ou direcionar para outro imóvel compatível.`,
        actionType: "whatsapp",
        priority: "Média",
        actionPayload: {
          phone: client?.phone || "",
          message: `Olá, ${v.clientName.split(" ")[0]}! Tudo bem? Gostaria de saber o que você achou do imóvel ${v.propertyTitle} que visitamos recentemente? A planta, a incidência de sol e o condomínio atenderam o que você esperava? Ficaria feliz em ouvir seu feedback!`,
          taskTitle: `Registrar feedback da visita: ${v.clientName}`,
          taskDescription: `Entrar em contato para colher feedback detalhado sobre a visita ao imóvel ${v.propertyTitle}`,
          taskType: "Cobrar retorno"
        }
      });
    });

    return mockResponse(rawCandidates.slice(0, 5));
  }

  return mockResponse({ error: "Endpoint não suportado no modo de demonstração local." }, 404);
}
