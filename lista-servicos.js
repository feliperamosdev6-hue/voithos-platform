const dentalServices = {
  "categories": [
    {
      "name": "Avaliações e Diagnósticos",
      "subcategories": [
        {
          "name": "Consultas",
          "services": [
            { "name": "Consulta odontológica inicial" },
            { "name": "Consulta de retorno" },
            { "name": "Avaliação de urgência" },
            { "name": "Check-up odontológico" },
            { "name": "Segunda opinião profissional" }
          ]
        },
        {
          "name": "Exames Clínicos",
          "services": [
            { "name": "Exame clínico completo" },
            { "name": "Avaliação com câmera intraoral" },
            { "name": "Mapeamento odontológico completo" }
          ]
        }
      ]
    },

    {
      "name": "Radiologia e Imagem",
      "subcategories": [
        {
          "name": "Radiografias",
          "services": [
            { "name": "Radiografia periapical" },
            { "name": "Radiografia panorâmica" },
            { "name": "Radiografia oclusal" },
            { "name": "Radiografia bite-wing" }
          ]
        },
        {
          "name": "Exames Avançados",
          "services": [
            { "name": "Tomografia computadorizada (CBCT)" },
            { "name": "Cefalometria" },
            { "name": "Documentação ortodôntica" },
            { "name": "Escaneamento digital" }
          ]
        }
      ]
    },

    {
      "name": "Prevenção e Profilaxia",
      "subcategories": [
        {
          "name": "Limpezas",
          "services": [
            { "name": "Limpeza (profilaxia)" },
            { "name": "Raspagem supragengival" },
            { "name": "Jato de bicarbonato" },
            { "name": "Polimento dental" }
          ]
        },
        {
          "name": "Prevenção",
          "services": [
            { "name": "Aplicação de flúor" },
            { "name": "Selante dental" },
            { "name": "Orientação de higiene bucal" }
          ]
        }
      ]
    },

    {
      "name": "Restaurações e Reconstruções",
      "subcategories": [
        {
          "name": "Restaurações",
          "services": [
            { "name": "Restauração em resina composta" },
            { "name": "Restauração em amálgama" },
            { "name": "Restauração provisória" },
            { "name": "Restauração estética" }
          ]
        },
        {
          "name": "Reconstruções",
          "services": [
            { "name": "Reconstrução de dente fraturado" },
            { "name": "Clareamento interno" },
            { "name": "Pino de fibra de vidro" },
            { "name": "Núcleo metálico" }
          ]
        }
      ]
    },

    {
      "name": "Endodontia (Canal)",
      "subcategories": [
        {
          "name": "Tratamento de Canal",
          "services": [
            { "name": "Canal – Incisivo/Canino" },
            { "name": "Canal – Pré-molar" },
            { "name": "Canal – Molar" },
            { "name": "Retratamento de canal" }
          ]
        },
        {
          "name": "Endodontia Cirúrgica",
          "services": [
            { "name": "Apicectomia" },
            { "name": "Tratamento de abscesso" }
          ]
        }
      ]
    },

    {
      "name": "Periodontia (Gengiva)",
      "subcategories": [
        {
          "name": "Tratamentos Clínicos",
          "services": [
            { "name": "Raspagem subgengival" },
            { "name": "Raspagem e alisamento radicular (RAR)" },
            { "name": "Tratamento de bolsas periodontais" }
          ]
        },
        {
          "name": "Cirurgias Periodontais",
          "services": [
            { "name": "Gengivoplastia" },
            { "name": "Gengivectomia" },
            { "name": "Aumento de coroa clínica" },
            { "name": "Enxerto gengival" }
          ]
        }
      ]
    },

    {
      "name": "Prótese Dentária",
      "subcategories": [
        {
          "name": "Próteses Removíveis",
          "services": [
            { "name": "Prótese total" },
            { "name": "Prótese parcial removível (PPR)" },
            { "name": "Reembasamento de prótese" },
            { "name": "Conserto de prótese" }
          ]
        },
        {
          "name": "Próteses Fixas",
          "services": [
            { "name": "Coroa metalocerâmica" },
            { "name": "Coroa de zircônia" },
            { "name": "Ponte fixa" },
            { "name": "Facetas de resina" },
            { "name": "Lente de contato dental" }
          ]
        }
      ]
    },

    {
      "name": "Implantodontia",
      "subcategories": [
        {
          "name": "Implantes",
          "services": [
            { "name": "Implante unitário" },
            { "name": "Implante múltiplo" },
            { "name": "Protocolo / All-on-4" },
            { "name": "Carga imediata" }
          ]
        },
        {
          "name": "Procedimentos Complementares",
          "services": [
            { "name": "Enxerto ósseo" },
            { "name": "Regeneração óssea guiada" },
            { "name": "Sinus lift" },
            { "name": "Instalação de cicatrizador" }
          ]
        }
      ]
    },

    {
      "name": "Ortodontia",
      "subcategories": [
        {
          "name": "Aparelhos Fixos",
          "services": [
            { "name": "Aparelho fixo metálico" },
            { "name": "Aparelho fixo estético" },
            { "name": "Aparelho autoligado" }
          ]
        },
        {
          "name": "Aparelhos Modernos",
          "services": [
            { "name": "Alinhadores (Invisalign)" },
            { "name": "Aparelho lingual" },
            { "name": "Expansor palatino" }
          ]
        },
        {
          "name": "Manutenções",
          "services": [
            { "name": "Manutenção mensal" },
            { "name": "Colocação de contenção" },
            { "name": "Remoção de aparelho" }
          ]
        }
      ]
    },

    {
      "name": "Cirurgia Bucomaxilofacial",
      "subcategories": [
        {
          "name": "Extrações",
          "services": [
            { "name": "Extração simples" },
            { "name": "Extração de dente decíduo" },
            { "name": "Extração de siso incluso" }
          ]
        },
        {
          "name": "Cirurgias",
          "services": [
            { "name": "Frenectomia" },
            { "name": "Biópsia bucal" },
            { "name": "Remoção de cisto" },
            { "name": "Drenagem de abscesso" }
          ]
        }
      ]
    },

    {
      "name": "Odontopediatria",
      "subcategories": [
        {
          "name": "Tratamentos Infantis",
          "services": [
            { "name": "Consulta infantil" },
            { "name": "Aplicação de flúor infantil" },
            { "name": "Restauração infantil" },
            { "name": "Extração infantil" },
            { "name": "Tratamento de trauma infantil" }
          ]
        }
      ]
    },

    {
      "name": "Estética Dental",
      "subcategories": [
        {
          "name": "Clareamento",
          "services": [
            { "name": "Clareamento a laser" },
            { "name": "Clareamento caseiro" },
            { "name": "Clareamento interno" }
          ]
        },
        {
          "name": "Harmonização do Sorriso",
          "services": [
            { "name": "Fechamento de diastema" },
            { "name": "Smile design" },
            { "name": "Microabrasão dental" }
          ]
        }
      ]
    },

    {
      "name": "Harmonização Orofacial",
      "subcategories": [
        {
          "name": "Aplicações",
          "services": [
            { "name": "Botox" },
            { "name": "Preenchimento labial" },
            { "name": "Skinbooster" },
            { "name": "Bioestimuladores" }
          ]
        },
        {
          "name": "Procedimentos",
          "services": [
            { "name": "Fios de sustentação" },
            { "name": "Bichectomia" },
            { "name": "Lipo de papada" }
          ]
        }
      ]
    },

    {
      "name": "Laserterapia",
      "subcategories": [
        {
          "name": "Tratamentos",
          "services": [
            { "name": "Laser para aftas" },
            { "name": "Laser para herpes" },
            { "name": "Laser pós-operatório" },
            { "name": "Laser para dor" }
          ]
        }
      ]
    },

    {
      "name": "Urgências Odontológicas",
      "subcategories": [
        {
          "name": "Procedimentos de Emergência",
          "services": [
            { "name": "Alívio de dor" },
            { "name": "Fratura dental" },
            { "name": "Abscesso" },
            { "name": "Trauma dentário" },
            { "name": "Reinstalação de dente avulsionado" }
          ]
        }
      ]
    },

    {
      "name": "Odontologia do Sono",
      "subcategories": [
        {
          "name": "Tratamentos",
          "services": [
            { "name": "Placa para bruxismo" },
            { "name": "Placa para ronco" },
            { "name": "Dispositivo intraoral para apneia" }
          ]
        }
      ]
    },

    {
      "name": "Serviços Complementares",
      "subcategories": [
        {
          "name": "Extras",
          "services": [
            { "name": "Documentação fotográfica" },
            { "name": "Laudo odontológico" },
            { "name": "Ajuste de placas" },
            { "name": "Teleconsulta" }
          ]
        }
      ]
    }
  ]
}