import { Property, Client, Task, Proposal, Visit } from "./types";

export function getInitialDemoData() {
  const today = new Date();
  
  const formatDate = (daysOffset: number): string => {
    const d = new Date();
    d.setDate(today.getDate() + daysOffset);
    return d.toISOString().split("T")[0];
  };

  const properties: Property[] = [
    {
      id: "demo-prop-1",
      code: "IM-1024",
      title: "Cobertura Duplex Jardim Botânico",
      type: "Apartamento",
      condition: "Usado",
      description: "Belíssima cobertura duplex totalmente reformada com vista panorâmica definitiva para o Parque Raia. No primeiro pavimento, amplo living em 3 ambientes com varanda integrada, lavabo, 3 suítes completas com armários embutidos de alto padrão e copa-cozinha planejada. No segundo pavimento, excelente área de lazer privativa com piscina aquecida, churrasqueira a carvão, espaço gourmet e deck de madeira de lei. Todo o imóvel com piso em porcelanato polido de grandes formatos, climatização em todos os ambientes e iluminação em LED automatizada.",
      modality: "Venda",
      price: 1250000,
      condo: 850,
      iptu: 250,
      address: "Avenida Wladimir Meirelles Ferreira, 1450",
      neighborhood: "Jardim Botânico",
      city: "Ribeirão Preto / SP",
      bedrooms: 3,
      suites: 3,
      bathrooms: 5,
      parkingSpots: 3,
      area: 210,
      photos: [
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80"
      ],
      amenities: ["Piscina Privativa", "Churrasqueira", "Portaria 24h", "Academia", "Salão de Festas"],
      status: "Disponível",
      captadorName: "Roberto Mendes",
      captadorPhone: "(16) 99123-4455",
      createdAt: formatDate(-15)
    },
    {
      id: "demo-prop-2",
      code: "IM-2055",
      title: "Casa em Condomínio de Luxo - Jardins",
      type: "Casa",
      condition: "Novo",
      description: "Sobrado moderno com arquitetura contemporânea e imponente. Living com pé-direito duplo de 6 metros totalmente integrado à varanda gourmet e área de lazer. São 4 amplas suítes no piso superior, sendo uma máster com closet e hidromassagem, todas com persianas integradas e automatizadas. Cozinha gourmet equipada com ilha central em granito preto absoluto. Lazer privativo espetacular composto por piscina de borda infinita com pastilhas de vidro revestida, sauna molhada, churrasqueira e paisagismo exuberante com irrigação automatizada.",
      modality: "Venda",
      price: 2450000,
      condo: 980,
      iptu: 400,
      address: "Alameda dos Jacarandás, Qd 45, Lt 12",
      neighborhood: "Jardins Madri",
      city: "Goiânia / GO",
      bedrooms: 4,
      suites: 4,
      bathrooms: 6,
      parkingSpots: 4,
      area: 380,
      photos: [
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"
      ],
      amenities: ["Portaria Blindada", "Quadra de Tênis", "Segurança 24h", "Sauna", "Piscina de Borda Infinita"],
      status: "Disponível",
      captadorName: "Patricia Silveira",
      captadorPhone: "(62) 99288-7766",
      createdAt: formatDate(-30)
    },
    {
      id: "demo-prop-3",
      code: "IM-3012",
      title: "Apartamento Garden no Bairro Finotti",
      type: "Apartamento",
      condition: "Usado",
      description: "Lindo apartamento com amplo quintal privativo (Garden) perfeito para quem tem pets ou gosta de cultivar plantas. São 3 quartos sendo 1 suíte, todos climatizados com aparelhos split inverter. Sala em 2 ambientes ligada ao terraço coberto com churrasqueira ecológica e lavanderia independente. Cozinha rica em armários planejados seminovos. Localização privilegiada no coração do Finotti, a apenas 3 minutos do Center Shopping e UFU. Prédio com elevador e taxa condominial muito acessível.",
      modality: "Venda",
      price: 750000,
      condo: 380,
      iptu: 120,
      address: "Rua João Naves de Ávila, 2200",
      neighborhood: "Finotti",
      city: "Uberlândia / MG",
      bedrooms: 3,
      suites: 1,
      bathrooms: 2,
      parkingSpots: 2,
      area: 125,
      photos: [
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80"
      ],
      amenities: ["Quintal Privativo", "Espaço Gourmet", "Elevador", "Cerca Elétrica"],
      status: "Disponível",
      captadorName: "Fabio Garcia",
      captadorPhone: "(34) 98877-6655",
      createdAt: formatDate(-5)
    },
    {
      id: "demo-prop-4",
      code: "IM-4099",
      title: "Studio Design Decorado em Pinheiros",
      type: "Apartamento",
      condition: "Novo",
      description: "Apartamento estúdio de alto padrão totalmente planejado por arquiteto renomado. Ideal para investidores de locação por temporada (Airbnb) ou jovens profissionais. Ambientes inteligentemente divididos com marcenaria sob medida de excelente qualidade, eletrodomésticos embutidos em inox de última geração e cama embutida. Decoração minimalista, ar condicionado central silencioso e varanda aconchegante com fechamento em vidro retrátil. Condomínio conceito moderno com lazer completo no rooftop.",
      modality: "Venda",
      price: 580000,
      condo: 520,
      iptu: 90,
      address: "Rua Fradique Coutinho, 780",
      neighborhood: "Pinheiros",
      city: "São Paulo / SP",
      bedrooms: 1,
      suites: 1,
      bathrooms: 1,
      parkingSpots: 1,
      area: 42,
      photos: [
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80"
      ],
      amenities: ["Lazer no Rooftop", "Piscina Aquecida", "Lavanderia Compartilhada", "Coworking", "Mini Market"],
      status: "Disponível",
      captadorName: "Juliana Santos",
      captadorPhone: "(11) 97766-5544",
      createdAt: formatDate(-12)
    },
    {
      id: "demo-prop-5",
      code: "IM-5033",
      title: "Sobrado Moderno no Karaíba",
      type: "Casa",
      condition: "Usado",
      description: "Excelente sobrado no bairro nobre da Zona Sul de Uberlândia. Arquitetura clean, ambientes amplos e bem arejados. No piso superior, 3 suítes, sendo a suíte máster com hidromassagem e sacada ampla. Piso térreo conta com escritório reversível para quarto, living integrado, sala de home theater aconchegante, copa-cozinha moderna com despensa. Delicioso espaço externo com churrasqueira, forno de pizza a lenha, ofurô para 5 pessoas com hidromassagem e iluminação cromoterápica, e belo jardim.",
      modality: "Venda",
      price: 1850000,
      condo: 0,
      iptu: 310,
      address: "Alameda das Américas, 430",
      neighborhood: "Karaíba",
      city: "Uberlândia / MG",
      bedrooms: 4,
      suites: 3,
      bathrooms: 5,
      parkingSpots: 3,
      area: 290,
      photos: [
        "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"
      ],
      amenities: ["Churrasqueira", "Ofurô", "Ar Condicionado", "Monitoramento por Câmeras", "Home Office"],
      status: "Reservado",
      captadorName: "Marcio Rezende",
      captadorPhone: "(34) 99191-2233",
      createdAt: formatDate(-25)
    },
    {
      id: "demo-prop-6",
      code: "IM-6088",
      title: "Sala Comercial Triplo A - Corporate Center",
      type: "Comercial",
      condition: "Novo",
      description: "Excelente conjunto comercial de altíssimo padrão, localizado na melhor região de negócios. Sala ampla em vão livre de fácil subdivisão, com piso elevado pronto para instalação de fiação, forro acústico modular com luminárias embutidas e ar-condicionado central VRF instalado de alta eficiência. Copa completa e 2 banheiros modernos revestidos com acabamento Deca. Edifício corporativo de renome com recepção blindada, heliponto, controle de acesso eletrônico biométrico avançado e estacionamento rotativo com manobrista.",
      modality: "Aluguel",
      price: 4500,
      condo: 900,
      iptu: 200,
      address: "Avenida Faria Lima, 3500",
      neighborhood: "Itaim Bibi",
      city: "São Paulo / SP",
      bedrooms: 0,
      suites: 0,
      bathrooms: 2,
      parkingSpots: 1,
      area: 75,
      photos: [
        "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80"
      ],
      amenities: ["Heliponto", "Estacionamento com Manobrista", "Cafeteria", "Recepção Blindada", "Auditório"],
      status: "Disponível",
      captadorName: "Lucas Ferreira",
      captadorPhone: "(11) 98888-2233",
      createdAt: formatDate(-8)
    }
  ];

  const clients: Client[] = [
    {
      id: "demo-client-1",
      name: "Thiago Vasconcelos",
      phone: "(16) 98122-3344",
      document: "123.456.789-00",
      email: "thiago.vasc@gmail.com",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "Instagram",
      interest: "Compra",
      budgetRange: "R$ 1.100.000 - R$ 1.400.000",
      neighborhoodOfInterest: "Jardim Botânico",
      desiredPropertyType: "Apartamento 3 suítes",
      status: "Novo",
      pipelineStatus: "Novo lead",
      temperature: "Quente",
      propertyType: "Apartamento",
      minBudget: 1100000,
      maxBudget: 1400000,
      observations: "Procura cobertura ou apartamento espaçoso no Jardim Botânico. Preza muito por vista bonita e área de lazer privativa ou condomínio com lazer de clube. Solteiro, empresário, quer fechar rápido.",
      createdAt: formatDate(-2),
      linkedPropertyId: "demo-prop-1",
      potentialValue: 1250000,
      closingProbability: "Média",
      commissionForecast: 50000, // 4%
      commissionPercent: 4,
      history: [
        {
          id: "h1",
          type: "creation",
          date: formatDate(-2) + " 10:30:15",
          description: "Lead importado automaticamente através do anúncio do Instagram da Cobertura Jardim Botânico.",
          userName: "Metria CRM"
        }
      ]
    },
    {
      id: "demo-client-2",
      name: "Mariana Alencar Silva",
      phone: "(62) 99344-5566",
      document: "987.654.321-11",
      email: "mariana.silva@outlook.com",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "Tráfego Pago",
      interest: "Compra",
      budgetRange: "R$ 2.200.000 - R$ 2.600.000",
      neighborhoodOfInterest: "Jardins",
      desiredPropertyType: "Casa em Condomínio",
      status: "Em Atendimento",
      pipelineStatus: "Primeiro contato",
      temperature: "Quente",
      propertyType: "Casa",
      minBudget: 2200000,
      maxBudget: 2600000,
      observations: "Família com 2 filhos pequenos buscando segurança e muito espaço externo. Querem condomínio fechado com ótima infraestrutura. Ela é médica, marido engenheiro.",
      createdAt: formatDate(-10),
      linkedPropertyId: "demo-prop-2",
      potentialValue: 2450000,
      closingProbability: "Alta",
      commissionForecast: 122500, // 5%
      commissionPercent: 5,
      history: [
        {
          id: "h2",
          type: "creation",
          date: formatDate(-10) + " 14:15:00",
          description: "Lead cadastrado manualmente via formulário de Tráfego Pago.",
          userName: "Carlos Brito"
        },
        {
          id: "h3",
          type: "whatsapp",
          date: formatDate(-9) + " 09:30:00",
          description: "Enviado WhatsApp de apresentação e qualificando necessidades de espaço e lazer.",
          userName: "Carlos Brito"
        },
        {
          id: "h4",
          type: "observation",
          date: formatDate(-9) + " 11:20:00",
          description: "Cliente respondeu dizendo que quer agendar visita o quanto antes. Prefere finais de semana na parte da manhã.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-3",
      name: "Carlos Eduardo Souza",
      phone: "(34) 99111-2233",
      document: "456.123.789-22",
      email: "carlosedu@souza.com.br",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "Indicação",
      interest: "Compra",
      budgetRange: "R$ 700.000 - R$ 800.000",
      neighborhoodOfInterest: "Finotti ou Santa Mônica",
      desiredPropertyType: "Apartamento 3 quartos",
      status: "Em Atendimento",
      pipelineStatus: "Em atendimento",
      temperature: "Morno",
      propertyType: "Apartamento",
      minBudget: 700000,
      maxBudget: 800000,
      observations: "Busca apartamento bem localizado, próximo a comércios. Dá preferência para andar alto e com 2 vagas de garagem. Tem interesse em dar um carro seminovo no valor de R$ 90.000 como parte do pagamento.",
      createdAt: formatDate(-8),
      linkedPropertyId: "demo-prop-3",
      potentialValue: 750000,
      closingProbability: "Média",
      commissionForecast: 30000, // 4%
      commissionPercent: 4,
      history: [
        {
          id: "h5",
          type: "creation",
          date: formatDate(-8) + " 16:40:00",
          description: "Lead cadastrado via indicação do corretor Fabio Garcia.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-4",
      name: "Beatriz Ramos",
      phone: "(11) 98765-1122",
      document: "333.444.555-66",
      email: "beatriz.ramos@uol.com.br",
      profileType: "Investidor",
      objective: "Compra",
      leadSource: "Portal Imobiliário",
      interest: "Compra",
      budgetRange: "R$ 550.000 - R$ 650.000",
      neighborhoodOfInterest: "Pinheiros, Jardins ou Vila Madalena",
      desiredPropertyType: "Studio ou 1 quarto para investimento",
      status: "Em Atendimento",
      pipelineStatus: "Imóvel enviado",
      temperature: "Quente",
      propertyType: "Apartamento",
      minBudget: 550000,
      maxBudget: 650000,
      observations: "Investidora profissional que compra imóveis de pequeno porte para alugar via plataforma digital (AirBnB). Quer alta liquidez e excelente rentabilidade de aluguel por metro quadrado. Pagará à vista.",
      createdAt: formatDate(-12),
      linkedPropertyId: "demo-prop-4",
      potentialValue: 580000,
      closingProbability: "Alta",
      commissionForecast: 23200, // 4%
      commissionPercent: 4,
      history: [
        {
          id: "h6",
          type: "creation",
          date: formatDate(-12) + " 08:30:00",
          description: "Lead captado pelo Zap Imóveis.",
          userName: "Carlos Brito"
        },
        {
          id: "h7",
          type: "whatsapp",
          date: formatDate(-11) + " 14:00:00",
          description: "WhatsApp enviado apresentando o Studio de Pinheiros decorado.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-5",
      name: "Eduardo Santos",
      phone: "(34) 99222-3344",
      document: "222.333.444-55",
      email: "edu.santos@terra.com.br",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "Placa",
      interest: "Compra",
      budgetRange: "R$ 1.700.000 - R$ 2.000.000",
      neighborhoodOfInterest: "Karaíba ou Morada da Colina",
      desiredPropertyType: "Casa ou Sobrado espaçoso",
      status: "Em Atendimento",
      pipelineStatus: "Visita agendada",
      temperature: "Quente",
      propertyType: "Casa",
      minBudget: 1700000,
      maxBudget: 2000000,
      observations: "Gostou muito da fachada do sobrado no Karaíba. Agendou visita para acompanhar a esposa. Busca ambientes integrados e área gourmet moderna. Tem aprovação de financiamento prévia.",
      createdAt: formatDate(-15),
      linkedPropertyId: "demo-prop-5",
      potentialValue: 1850000,
      closingProbability: "Média",
      commissionForecast: 92500, // 5%
      commissionPercent: 5,
      history: [
        {
          id: "h8",
          type: "creation",
          date: formatDate(-15) + " 11:00:00",
          description: "Lead cadastrado após contato telefônico originado de placa física no imóvel.",
          userName: "Carlos Brito"
        },
        {
          id: "h9",
          type: "visit_scheduled",
          date: formatDate(-1) + " 17:00:00",
          description: "Agendada visita guiada com a presença da família inteira no Sobrado Karaíba.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-6",
      name: "Fernanda Lima de Oliveira",
      phone: "(62) 99111-8899",
      document: "555.666.777-88",
      email: "fernanda.lima@outlook.com",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "Tráfego Pago",
      interest: "Compra",
      budgetRange: "R$ 2.300.000 - R$ 2.600.000",
      neighborhoodOfInterest: "Jardins",
      desiredPropertyType: "Casa Moderna de Alto Luxo",
      status: "Em Atendimento",
      pipelineStatus: "Visita realizada",
      temperature: "Quente",
      propertyType: "Casa",
      minBudget: 2300000,
      maxBudget: 2600000,
      observations: "Visitou a Casa no condomínio Jardins Madri. Adorou a piscina de borda infinita e o paisagismo. Fez perguntas pontuais sobre a incidência de sol na suíte máster e a voltagem do condomínio.",
      createdAt: formatDate(-20),
      linkedPropertyId: "demo-prop-2",
      potentialValue: 2450000,
      closingProbability: "Alta",
      commissionForecast: 122500, // 5%
      commissionPercent: 5,
      history: [
        {
          id: "h10",
          type: "creation",
          date: formatDate(-20) + " 15:00:00",
          description: "Lead vindo do Facebook Ads.",
          userName: "Carlos Brito"
        },
        {
          id: "h11",
          type: "visit_scheduled",
          date: formatDate(-5) + " 10:00:00",
          description: "Visita realizada com sucesso.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-7",
      name: "Roberto Mendes Junior",
      phone: "(16) 99222-1111",
      document: "777.888.999-00",
      email: "roberto.junior@mendes.com",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "OLX",
      interest: "Compra",
      budgetRange: "R$ 1.100.000 - R$ 1.300.000",
      neighborhoodOfInterest: "Jardim Botânico",
      desiredPropertyType: "Cobertura Duplex 3 quartos",
      status: "Proposta",
      pipelineStatus: "Proposta enviada",
      temperature: "Quente",
      propertyType: "Apartamento",
      minBudget: 1100000,
      maxBudget: 1300000,
      observations: "Enviou proposta formal para compra da Cobertura Jardim Botânico. Proposta de R$ 1.180.000 (abaixo da pedida de R$ 1.25M), oferecendo entrada em dinheiro de 50% e o restante via financiamento bancário.",
      createdAt: formatDate(-22),
      linkedPropertyId: "demo-prop-1",
      potentialValue: 1250000,
      closingProbability: "Alta",
      commissionForecast: 59000, // 5% de 1.18M
      commissionPercent: 5,
      history: [
        {
          id: "h12",
          type: "creation",
          date: formatDate(-22) + " 09:00:00",
          description: "Lead recebido pelo anúncio da OLX.",
          userName: "Carlos Brito"
        },
        {
          id: "h13",
          type: "visit_scheduled",
          date: formatDate(-15) + " 11:00:00",
          description: "Visita realizada, gostou muito.",
          userName: "Carlos Brito"
        },
        {
          id: "h14",
          type: "proposal_sent",
          date: formatDate(-3) + " 16:30:00",
          description: "Proposta de R$ 1.180.000 enviada ao proprietário. Aguardando contraproposta do proprietário.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-8",
      name: "Juliana Costa",
      phone: "(11) 99988-7766",
      document: "111.222.333-44",
      email: "juliana.costa@empresa.com.br",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "WhatsApp",
      interest: "Compra",
      budgetRange: "R$ 700.000 - R$ 780.000",
      neighborhoodOfInterest: "Finotti",
      desiredPropertyType: "Apartamento Garden",
      status: "Proposta",
      pipelineStatus: "Em negociação",
      temperature: "Quente",
      propertyType: "Apartamento",
      minBudget: 700000,
      maxBudget: 780000,
      observations: "Em negociação ativa dos detalhes do contrato de compra do apartamento Garden. Proprietário aceitou a proposta mas impôs uma cláusula de desocupação de 60 dias que Juliana está tentando reduzir para 30 dias.",
      createdAt: formatDate(-25),
      linkedPropertyId: "demo-prop-3",
      potentialValue: 750000,
      closingProbability: "Alta",
      commissionForecast: 30000, // 4%
      commissionPercent: 4,
      history: [
        {
          id: "h15",
          type: "creation",
          date: formatDate(-25) + " 10:00:00",
          description: "Lead recebido via botão de WhatsApp do site.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-9",
      name: "Aline Torres",
      phone: "(11) 98111-2222",
      document: "333.555.777-99",
      email: "aline.torres@adv.com.br",
      profileType: "Locatário",
      objective: "Locação",
      leadSource: "Portal Imobiliário",
      interest: "Locação",
      budgetRange: "R$ 4.000 - R$ 5.000",
      neighborhoodOfInterest: "Itaim Bibi",
      desiredPropertyType: "Sala Comercial",
      status: "Contrato",
      pipelineStatus: "Documentação",
      temperature: "Quente",
      propertyType: "Comercial",
      minBudget: 4000,
      maxBudget: 5000,
      observations: "Locação da Sala Comercial no Corporate Center. Enviou todos os documentos necessários (faturamento PJ, ficha cadastral e fiador). Ficha pré-aprovada na seguradora, em fase de conferência jurídica de documentos.",
      createdAt: formatDate(-28),
      linkedPropertyId: "demo-prop-6",
      potentialValue: 4500,
      closingProbability: "Alta",
      commissionForecast: 4500, // 1 Aluguel
      commissionPercent: 100,
      history: [
        {
          id: "h16",
          type: "creation",
          date: formatDate(-28) + " 13:00:00",
          description: "Lead originado do portal VivaReal.",
          userName: "Carlos Brito"
        },
        {
          id: "h17",
          type: "observation",
          date: formatDate(-2) + " 11:00:00",
          description: "Documentação enviada para análise jurídica da imobiliária parceira.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-10",
      name: "Gustavo Ferreira",
      phone: "(11) 99122-8877",
      document: "444.888.222-33",
      email: "gustavo.ferreira@gmail.com",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "Tráfego Pago",
      interest: "Compra",
      budgetRange: "R$ 550.000 - R$ 600.000",
      neighborhoodOfInterest: "Pinheiros",
      desiredPropertyType: "Studio Decorado",
      status: "Contrato",
      pipelineStatus: "Contrato",
      temperature: "Quente",
      propertyType: "Apartamento",
      minBudget: 550000,
      maxBudget: 600000,
      observations: "Minuta de contrato de compra do Studio Pinheiros enviada para assinatura digital na plataforma Docusign. Ambas as partes cientes de todos os fluxos. Assinatura agendada para finalização até amanhã.",
      createdAt: formatDate(-32),
      linkedPropertyId: "demo-prop-4",
      potentialValue: 580000,
      closingProbability: "Alta",
      commissionForecast: 23200, // 4%
      commissionPercent: 4,
      history: [
        {
          id: "h18",
          type: "creation",
          date: formatDate(-32) + " 17:00:00",
          description: "Lead vindo do formulário de Facebook Ads.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-11",
      name: "Pedro Henrique Oliveira",
      phone: "(34) 99888-1122",
      document: "999.000.111-22",
      email: "pedro.henrique@uol.com.br",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "Instagram",
      interest: "Compra",
      budgetRange: "R$ 700.000 - R$ 800.000",
      neighborhoodOfInterest: "Finotti",
      desiredPropertyType: "Apartamento Garden",
      status: "Ganho",
      pipelineStatus: "Fechado",
      temperature: "Quente",
      propertyType: "Apartamento",
      minBudget: 700000,
      maxBudget: 800000,
      observations: "NEGÓCIO FECHADO COM SUCESSO! Compra do Apartamento Garden no Bairro Finotti concretizada. Escritura lavrada no cartório, ITBI pago e chaves devidamente entregues ao novo proprietário. Parabéns pelo fechamento!",
      createdAt: formatDate(-45),
      linkedPropertyId: "demo-prop-3",
      potentialValue: 750000,
      closingProbability: "Alta",
      commissionForecast: 30000, // 4%
      commissionPercent: 4,
      history: [
        {
          id: "h19",
          type: "creation",
          date: formatDate(-45) + " 10:00:00",
          description: "Lead originado do Instagram.",
          userName: "Carlos Brito"
        },
        {
          id: "h20",
          type: "proposal_sent",
          date: formatDate(-25) + " 14:00:00",
          description: "Proposta de R$ 740.000 aceita pelo vendedor à vista.",
          userName: "Carlos Brito"
        },
        {
          id: "h21",
          type: "whatsapp",
          date: formatDate(-5) + " 15:30:00",
          description: "Parabenização enviada pelas chaves entregues.",
          userName: "Carlos Brito"
        }
      ]
    },
    {
      id: "demo-client-12",
      name: "Camila Rocha",
      phone: "(34) 98122-9900",
      document: "555.222.111-00",
      email: "camila_rocha@gmail.com",
      profileType: "Comprador",
      objective: "Compra",
      leadSource: "Placa",
      interest: "Compra",
      budgetRange: "R$ 800.000 - R$ 900.000",
      neighborhoodOfInterest: "Karaíba",
      desiredPropertyType: "Casa ou Sobrado",
      status: "Perdido",
      pipelineStatus: "Perdido",
      temperature: "Frio",
      propertyType: "Casa",
      minBudget: 800000,
      maxBudget: 900000,
      observations: "Negócio cancelado devido à taxa de condomínio muito elevada relatada na região de interesse, além de discordâncias no fluxo de parcelas. Optou por comprar em outra imobiliária.",
      createdAt: formatDate(-18),
      linkedPropertyId: "demo-prop-5",
      potentialValue: 1850000,
      closingProbability: "Baixa",
      commissionForecast: 0,
      commissionPercent: 5,
      lossReason: "Preço / Taxas de Condomínio elevadas no condomínio fechado",
      history: [
        {
          id: "h22",
          type: "creation",
          date: formatDate(-18) + " 09:00:00",
          description: "Lead originado de placa física no local.",
          userName: "Carlos Brito"
        },
        {
          id: "h23",
          type: "loss",
          date: formatDate(-1) + " 16:00:00",
          description: "Lead marcado como perdido. Motivo: Preço do condomínio fora do orçamento de taxas mensais da cliente.",
          userName: "Carlos Brito"
        }
      ]
    }
  ];

  const proposals: Proposal[] = [
    {
      id: "demo-prop-p1",
      clientId: "demo-client-7",
      clientName: "Roberto Mendes Junior",
      propertyId: "demo-prop-1",
      propertyTitle: "Cobertura Duplex Jardim Botânico",
      proposedValue: 1180000,
      status: "Em Análise",
      date: formatDate(-3),
      observations: "Proposta à vista de R$ 500.000 em dinheiro na assinatura do contrato e o saldo de R$ 680.000 via financiamento aprovado no Banco do Brasil. Proprietário analisando se aceita ou se envia contraproposta de R$ 1.22M."
    },
    {
      id: "demo-prop-p2",
      clientId: "demo-client-11",
      clientName: "Pedro Henrique Oliveira",
      propertyId: "demo-prop-3",
      propertyTitle: "Apartamento Garden no Bairro Finotti",
      proposedValue: 740000,
      status: "Aceita",
      date: formatDate(-25),
      observations: "Proposta de R$ 740.000 aceita pelo proprietário sem ressalvas para pagamento à vista. Processo finalizado."
    },
    {
      id: "demo-prop-p3",
      clientId: "demo-client-8",
      clientName: "Juliana Costa",
      propertyId: "demo-prop-3",
      propertyTitle: "Apartamento Garden no Bairro Finotti",
      proposedValue: 750000,
      status: "Em Análise",
      date: formatDate(-1),
      observations: "Aprovada proposta de valor total, porém em negociação ativa sobre a data de imissão de posse (desocupação de 60 dias vs 30 dias)."
    }
  ];

  const visits: Visit[] = [
    {
      id: "demo-visit-v1",
      clientId: "demo-client-5",
      clientName: "Eduardo Santos",
      propertyId: "demo-prop-5",
      propertyTitle: "Sobrado Moderno no Karaíba",
      date: formatDate(1),
      time: "14:00",
      status: "Agendada",
      observations: "Visita confirmada via WhatsApp. Cliente comparecerá com a esposa e filhos. Marcar ponto de encontro na portaria às 13:50."
    },
    {
      id: "demo-visit-v2",
      clientId: "demo-client-6",
      clientName: "Fernanda Lima de Oliveira",
      propertyId: "demo-prop-2",
      propertyTitle: "Casa em Condomínio de Luxo - Jardins",
      date: formatDate(-5),
      time: "10:00",
      status: "Realizada",
      observations: "Visita espetacular. A cliente demonstrou enorme entusiasmo pela casa, especialmente pelo projeto de paisagismo e área de lazer. Quer avaliar condições de financiamento do Itaú.",
      feedback: "Excelente! Climatização perfeita, iluminação excelente. Ficou apenas em dúvida sobre a taxa de condomínio, mas adorou o imóvel."
    },
    {
      id: "demo-visit-v3",
      clientId: "demo-client-12",
      clientName: "Camila Rocha",
      propertyId: "demo-prop-5",
      propertyTitle: "Sobrado Moderno no Karaíba",
      date: formatDate(-10),
      time: "16:00",
      status: "Cancelada",
      observations: "Cancelada a pedido da cliente por motivos profissionais urgentes de viagem. Não reagendou no momento.",
      feedback: "Não pôde comparecer."
    }
  ];

  const tasks: Task[] = [
    {
      id: "demo-task-1",
      date: formatDate(0),
      time: "09:30",
      title: "Enviar WhatsApp de qualificação",
      clientId: "demo-client-1",
      clientName: "Thiago Vasconcelos",
      propertyId: "demo-prop-1",
      propertyTitle: "Cobertura Duplex Jardim Botânico",
      type: "Enviar WhatsApp",
      priority: "alta",
      completed: false,
      description: "Mandar mensagem de boas-vindas para o Thiago, qualificar o interesse dele na Cobertura Duplex e se colocar à disposição para enviar outras opções ou marcar uma visita."
    },
    {
      id: "demo-task-2",
      date: formatDate(1),
      time: "13:30",
      title: "Confirmar visita",
      clientId: "demo-client-5",
      clientName: "Eduardo Santos",
      propertyId: "demo-prop-5",
      propertyTitle: "Sobrado Moderno no Karaíba",
      type: "Confirmar visita",
      priority: "alta",
      completed: false,
      description: "Entrar em contato por telefone ou WhatsApp com Eduardo Santos confirmando a visita agendada para amanhã às 14:00."
    },
    {
      id: "demo-task-3",
      date: formatDate(2),
      time: "11:00",
      title: "Ligar para feedback de documentos",
      clientId: "demo-client-9",
      clientName: "Aline Torres",
      propertyId: "demo-prop-6",
      propertyTitle: "Sala Comercial Triplo A - Corporate Center",
      type: "Documentação",
      priority: "alta",
      completed: false,
      description: "Cobrar parecer jurídico sobre a seguradora fiadora do contrato comercial da Aline Torres para liberarmos as assinaturas eletrônicas."
    },
    {
      id: "demo-task-4",
      date: formatDate(-1),
      time: "15:00",
      title: "Mandar parabéns pelas chaves",
      clientId: "demo-client-11",
      clientName: "Pedro Henrique Oliveira",
      propertyId: "demo-prop-3",
      propertyTitle: "Apartamento Garden no Bairro Finotti",
      type: "Ligar",
      priority: "baixa",
      completed: true,
      description: "Telefonar ou enviar um WhatsApp especial parabenizando o Pedro pela entrega das chaves físicas e desejando felicidades na moradia nova."
    }
  ];

  return {
    properties,
    clients,
    proposals,
    visits,
    tasks
  };
}
