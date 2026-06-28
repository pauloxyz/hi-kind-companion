
-- ============ Modules ============
CREATE TABLE public.english_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_pt text NOT NULL,
  title_en text NOT NULL,
  description_pt text NOT NULL,
  icon text NOT NULL DEFAULT 'BookOpen',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.english_modules TO anon, authenticated;
GRANT ALL ON public.english_modules TO service_role;
ALTER TABLE public.english_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "english_modules readable by everyone"
  ON public.english_modules FOR SELECT
  USING (true);

-- ============ Lessons ============
CREATE TABLE public.english_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.english_modules(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title_pt text NOT NULL,
  title_en text NOT NULL,
  intro_pt text NOT NULL DEFAULT '',
  phrases jsonb NOT NULL DEFAULT '[]'::jsonb,
  quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module_id, slug)
);

GRANT SELECT ON public.english_lessons TO anon, authenticated;
GRANT ALL ON public.english_lessons TO service_role;
ALTER TABLE public.english_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "english_lessons readable by everyone"
  ON public.english_lessons FOR SELECT
  USING (true);

-- ============ Progress ============
CREATE TABLE public.english_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.english_lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  quiz_correct int NOT NULL DEFAULT 0,
  quiz_total int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, lesson_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.english_progress TO authenticated;
GRANT ALL ON public.english_progress TO service_role;
ALTER TABLE public.english_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "english_progress: own rows"
  ON public.english_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============ Seed modules ============
INSERT INTO public.english_modules (slug, title_pt, title_en, description_pt, icon, sort_order) VALUES
  ('basico', 'Básico', 'Basics', 'Saudações, números, alfabeto e frases do dia a dia.', 'Sparkles', 1),
  ('entrevista', 'Entrevista de Emprego H-2A', 'H-2A Job Interview', 'Perguntas comuns do empregador e respostas modelo.', 'Briefcase', 2),
  ('aeroporto', 'Aeroporto e Imigração', 'Airport & Immigration', 'Vocabulário e diálogos de chegada nos EUA.', 'Plane', 3),
  ('campo', 'Trabalho no Campo', 'Field Work', 'Ferramentas, instruções, segurança e comunicação com o supervisor.', 'Tractor', 4);

-- ============ Helper: seed lessons ============
-- Each lesson has phrases [{en, pt, note?}] and quiz [{q, options:[], correct:0}]

WITH m AS (SELECT id FROM public.english_modules WHERE slug='basico')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, intro_pt, phrases, quiz, sort_order, is_free)
SELECT m.id, x.slug, x.title_pt, x.title_en, x.intro_pt, x.phrases::jsonb, x.quiz::jsonb, x.sort_order, x.is_free FROM m, (VALUES
  ('saudacoes', 'Saudações e apresentação', 'Greetings & introductions',
   'Aprenda como cumprimentar e se apresentar em inglês — o primeiro passo de qualquer conversa.',
   '[
    {"en":"Hello, my name is Paulo.","pt":"Olá, meu nome é Paulo."},
    {"en":"Nice to meet you.","pt":"Prazer em conhecê-lo."},
    {"en":"How are you?","pt":"Como você está?"},
    {"en":"I am fine, thank you.","pt":"Estou bem, obrigado."},
    {"en":"I am from Brazil.","pt":"Eu sou do Brasil."},
    {"en":"I speak a little English.","pt":"Eu falo um pouco de inglês."},
    {"en":"Could you repeat, please?","pt":"Você pode repetir, por favor?"},
    {"en":"Sorry, I didn''t understand.","pt":"Desculpe, eu não entendi."}
   ]',
   '[
    {"q":"Como se diz \"Prazer em conhecê-lo\"?","options":["See you later","Nice to meet you","How old are you","Where are you from"],"correct":1},
    {"q":"\"I am from Brazil\" significa:","options":["Eu vou ao Brasil","Eu sou do Brasil","Eu gosto do Brasil","Eu vim do Brasil ontem"],"correct":1},
    {"q":"Para pedir que repitam, você diz:","options":["Repeat now","Could you repeat, please?","Say again fast","Talk slow me"],"correct":1}
   ]', 1, true),

  ('numeros', 'Números e horas', 'Numbers & time',
   'Saber falar números e horários é essencial para combinar trabalho, salário e horários.',
   '[
    {"en":"One, two, three, four, five.","pt":"Um, dois, três, quatro, cinco."},
    {"en":"Ten, twenty, thirty, forty, fifty.","pt":"Dez, vinte, trinta, quarenta, cinquenta."},
    {"en":"One hundred dollars per day.","pt":"Cem dólares por dia."},
    {"en":"What time is it?","pt":"Que horas são?"},
    {"en":"It is seven o''clock.","pt":"São sete horas."},
    {"en":"We start at six in the morning.","pt":"Começamos às seis da manhã."},
    {"en":"We finish at four in the afternoon.","pt":"Terminamos às quatro da tarde."}
   ]',
   '[
    {"q":"\"Fifty\" é:","options":["15","50","500","5"],"correct":1},
    {"q":"\"We start at six in the morning\" quer dizer:","options":["Começamos às seis da manhã","Acordamos às seis","Comemos às seis","Saímos às seis"],"correct":0},
    {"q":"Como perguntar as horas?","options":["What hour now","What time is it?","When is clock","How time"],"correct":1}
   ]', 2, true),

  ('alfabeto', 'Alfabeto e soletrar', 'Alphabet & spelling',
   'Soletrar é fundamental para passar seu nome, endereço e documentos sem erro.',
   '[
    {"en":"A, B, C, D, E, F, G.","pt":"A, B, C, D, E, F, G."},
    {"en":"How do you spell your name?","pt":"Como se soletra seu nome?"},
    {"en":"My name is spelled P-A-U-L-O.","pt":"Meu nome é P-A-U-L-O."},
    {"en":"What is your last name?","pt":"Qual é seu sobrenome?"},
    {"en":"My phone number is...","pt":"Meu telefone é..."}
   ]',
   '[
    {"q":"\"How do you spell\" significa:","options":["Como você fala","Como se soletra","Como você escreve grande","Como se chama"],"correct":1},
    {"q":"\"Last name\" é:","options":["Último nome usado","Sobrenome","Apelido","Nome completo"],"correct":1}
   ]', 3, false),

  ('dia-dia', 'Frases do dia a dia', 'Everyday phrases',
   'Frases curtas que você vai usar várias vezes por dia.',
   '[
    {"en":"Yes / No / Maybe.","pt":"Sim / Não / Talvez."},
    {"en":"Please / Thank you / You''re welcome.","pt":"Por favor / Obrigado / De nada."},
    {"en":"Excuse me.","pt":"Com licença."},
    {"en":"I need help.","pt":"Eu preciso de ajuda."},
    {"en":"Where is the bathroom?","pt":"Onde fica o banheiro?"},
    {"en":"I am hungry / thirsty / tired.","pt":"Estou com fome / com sede / cansado."}
   ]',
   '[
    {"q":"\"I need help\" é:","options":["Eu ajudo","Eu preciso de ajuda","Eu sei ajudar","Ajude-me amanhã"],"correct":1},
    {"q":"\"Excuse me\" serve para:","options":["Pedir desculpa por erro","Chamar atenção educadamente","Agradecer","Despedir-se"],"correct":1}
   ]', 4, false),

  ('emergencias', 'Emergências e saúde', 'Emergencies & health',
   'Vocabulário essencial caso algo dê errado.',
   '[
    {"en":"Help!","pt":"Socorro!"},
    {"en":"Call 911.","pt":"Chame o 911."},
    {"en":"I feel sick.","pt":"Estou me sentindo mal."},
    {"en":"I have a headache.","pt":"Estou com dor de cabeça."},
    {"en":"I need a doctor.","pt":"Preciso de um médico."},
    {"en":"I am allergic to...","pt":"Eu sou alérgico a..."}
   ]',
   '[
    {"q":"Número de emergência nos EUA:","options":["190","911","112","999"],"correct":1},
    {"q":"\"I need a doctor\" é:","options":["Preciso de remédio","Preciso de médico","Sou médico","Onde tem hospital"],"correct":1}
   ]', 5, false)
) AS x(slug, title_pt, title_en, intro_pt, phrases, quiz, sort_order, is_free);

WITH m AS (SELECT id FROM public.english_modules WHERE slug='entrevista')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, intro_pt, phrases, quiz, sort_order, is_free)
SELECT m.id, x.slug, x.title_pt, x.title_en, x.intro_pt, x.phrases::jsonb, x.quiz::jsonb, x.sort_order, x.is_free FROM m, (VALUES
  ('apresentacao', 'Se apresentando ao empregador', 'Introducing yourself to the employer',
   'Frases para a primeira ligação ou videochamada com o empregador americano.',
   '[
    {"en":"Good morning, my name is Paulo Silva.","pt":"Bom dia, meu nome é Paulo Silva."},
    {"en":"Thank you for the opportunity.","pt":"Obrigado pela oportunidade."},
    {"en":"I am 32 years old and I am from Minas Gerais, Brazil.","pt":"Tenho 32 anos e sou de Minas Gerais, Brasil."},
    {"en":"I have ten years of experience in agriculture.","pt":"Tenho dez anos de experiência na agricultura."},
    {"en":"I am ready to work hard and learn.","pt":"Estou pronto para trabalhar duro e aprender."}
   ]',
   '[
    {"q":"\"Thank you for the opportunity\" significa:","options":["Obrigado pela ajuda","Obrigado pela oportunidade","Obrigado pelo trabalho","Obrigado pelo dinheiro"],"correct":1},
    {"q":"Como dizer que tem 10 anos de experiência?","options":["I have ten years of experience","I work ten years","Ten years I have","My experience ten"],"correct":0}
   ]', 1, true),

  ('experiencia', 'Falando da sua experiência', 'Talking about your experience',
   'Como descrever o que você já fez na lavoura.',
   '[
    {"en":"I have worked with coffee, oranges, and corn.","pt":"Já trabalhei com café, laranjas e milho."},
    {"en":"I can drive a tractor.","pt":"Sei dirigir trator."},
    {"en":"I can operate harvesters and sprayers.","pt":"Sei operar colheitadeiras e pulverizadores."},
    {"en":"I worked on a 200-hectare farm.","pt":"Trabalhei em uma fazenda de 200 hectares."},
    {"en":"I am used to working long hours in the sun.","pt":"Estou acostumado a trabalhar muitas horas no sol."}
   ]',
   '[
    {"q":"\"I can drive a tractor\" é:","options":["Quero comprar um trator","Sei dirigir trator","Vou consertar trator","Tenho um trator"],"correct":1},
    {"q":"\"I am used to working long hours\" significa:","options":["Estou cansado de longas horas","Eu costumava trabalhar muito","Estou acostumado a trabalhar muitas horas","Não gosto de longas horas"],"correct":2}
   ]', 2, true),

  ('perguntas', 'Perguntas comuns do empregador', 'Common employer questions',
   'Esteja preparado para as perguntas mais frequentes.',
   '[
    {"en":"Have you worked in the United States before?","pt":"Você já trabalhou nos Estados Unidos antes?"},
    {"en":"Do you have a valid passport?","pt":"Você tem passaporte válido?"},
    {"en":"Why do you want this job?","pt":"Por que você quer este trabalho?"},
    {"en":"Can you start in March?","pt":"Você pode começar em março?"},
    {"en":"Do you have any health problems?","pt":"Você tem algum problema de saúde?"},
    {"en":"Are you available to work weekends?","pt":"Você está disponível para trabalhar fins de semana?"}
   ]',
   '[
    {"q":"\"Do you have a valid passport?\" é:","options":["Você tem passaporte válido?","Você quer passaporte?","Você tem visto?","Você é brasileiro?"],"correct":0},
    {"q":"\"Can you start in March?\" significa:","options":["Você gosta de março?","Você pode começar em março?","Você nasceu em março?","Você vem em março?"],"correct":1}
   ]', 3, false),

  ('respostas', 'Boas respostas modelo', 'Strong model answers',
   'Respostas curtas e fortes que mostram confiança.',
   '[
    {"en":"No, this is my first time, but I am very motivated.","pt":"Não, é minha primeira vez, mas estou muito motivado."},
    {"en":"Yes, my passport is valid until 2030.","pt":"Sim, meu passaporte é válido até 2030."},
    {"en":"I want this job to provide for my family.","pt":"Quero este trabalho para sustentar minha família."},
    {"en":"Yes, I can start any time you need me.","pt":"Sim, posso começar a qualquer momento."},
    {"en":"I am healthy and ready to work.","pt":"Sou saudável e estou pronto para trabalhar."}
   ]',
   '[
    {"q":"\"I want this job to provide for my family\" é:","options":["Quero este trabalho para minha família","Quero este trabalho para sustentar minha família","Minha família quer este trabalho","Trabalho com minha família"],"correct":1}
   ]', 4, false),

  ('negociacao', 'Salário, moradia e transporte', 'Pay, housing & transportation',
   'Faça as perguntas certas antes de aceitar a vaga.',
   '[
    {"en":"What is the hourly rate?","pt":"Qual é o valor por hora?"},
    {"en":"Do you provide housing?","pt":"Vocês fornecem moradia?"},
    {"en":"Is transportation included?","pt":"O transporte está incluído?"},
    {"en":"How many hours per week?","pt":"Quantas horas por semana?"},
    {"en":"When is payday?","pt":"Quando é o dia de pagamento?"}
   ]',
   '[
    {"q":"\"Do you provide housing?\" significa:","options":["Vocês têm casa para alugar?","Vocês fornecem moradia?","Vocês moram aqui?","Qual o aluguel?"],"correct":1},
    {"q":"\"When is payday?\" é:","options":["Quando paga?","Quando é o dia de pagamento?","Quando trabalha?","Quando começa?"],"correct":1}
   ]', 5, false)
) AS x(slug, title_pt, title_en, intro_pt, phrases, quiz, sort_order, is_free);

WITH m AS (SELECT id FROM public.english_modules WHERE slug='aeroporto')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, intro_pt, phrases, quiz, sort_order, is_free)
SELECT m.id, x.slug, x.title_pt, x.title_en, x.intro_pt, x.phrases::jsonb, x.quiz::jsonb, x.sort_order, x.is_free FROM m, (VALUES
  ('check-in', 'Check-in e embarque', 'Check-in & boarding',
   'O que dizer no balcão da companhia aérea.',
   '[
    {"en":"Here is my passport and ticket.","pt":"Aqui está meu passaporte e passagem."},
    {"en":"I have one suitcase to check.","pt":"Tenho uma mala para despachar."},
    {"en":"Window seat, please.","pt":"Assento na janela, por favor."},
    {"en":"What gate is my flight?","pt":"Qual o portão do meu voo?"},
    {"en":"What time does boarding start?","pt":"A que horas começa o embarque?"}
   ]',
   '[
    {"q":"\"One suitcase to check\" é:","options":["Uma mala para checar dentro do avião","Uma mala para despachar","Uma mala de mão","Uma mala perdida"],"correct":1},
    {"q":"\"Window seat\" é:","options":["Assento do meio","Assento do corredor","Assento da janela","Assento da frente"],"correct":2}
   ]', 1, true),

  ('imigracao', 'Imigração americana (CBP)', 'US Immigration (CBP)',
   'As perguntas do oficial da imigração na chegada — responda curto e direto.',
   '[
    {"en":"What is the purpose of your visit?","pt":"Qual o motivo da sua visita?"},
    {"en":"I am here to work with an H-2A visa.","pt":"Estou aqui para trabalhar com visto H-2A."},
    {"en":"How long will you stay?","pt":"Quanto tempo vai ficar?"},
    {"en":"For nine months, sir.","pt":"Por nove meses, senhor."},
    {"en":"Where will you stay?","pt":"Onde vai ficar?"},
    {"en":"At my employer''s farm in California.","pt":"Na fazenda do meu empregador, na Califórnia."},
    {"en":"Here is my contract and employer letter.","pt":"Aqui está meu contrato e a carta do empregador."}
   ]',
   '[
    {"q":"\"What is the purpose of your visit?\" significa:","options":["Qual é seu propósito de vida?","Qual o motivo da sua visita?","Quem visitou você?","Onde você visita?"],"correct":1},
    {"q":"Boa resposta sobre o tempo de estadia (H-2A):","options":["Forever, sir","I don''t know","For nine months, sir","Maybe two years"],"correct":2}
   ]', 2, true),

  ('alfandega', 'Alfândega e bagagem', 'Customs & baggage',
   'Declarando o que você traz e pegando suas malas.',
   '[
    {"en":"Do you have anything to declare?","pt":"Você tem algo a declarar?"},
    {"en":"No, I only have personal items.","pt":"Não, só tenho itens pessoais."},
    {"en":"I am carrying less than ten thousand dollars.","pt":"Estou trazendo menos de dez mil dólares."},
    {"en":"I have no food or plants.","pt":"Não tenho comida nem plantas."},
    {"en":"Where is the baggage claim?","pt":"Onde fica a esteira de bagagens?"}
   ]',
   '[
    {"q":"\"Anything to declare?\" significa:","options":["Algo a declarar?","Algo a esconder?","Algo a comprar?","Algo a vender?"],"correct":0},
    {"q":"\"Baggage claim\" é:","options":["Reclamação de mala","Esteira de bagagens","Cobrança de mala","Mala perdida"],"correct":1}
   ]', 3, false),

  ('conexao', 'Conexão e transporte', 'Connections & transportation',
   'Pegar conexão, táxi, ônibus ou encontrar o motorista do empregador.',
   '[
    {"en":"Excuse me, where is gate B12?","pt":"Com licença, onde fica o portão B12?"},
    {"en":"I missed my connection.","pt":"Perdi minha conexão."},
    {"en":"How can I get to the bus station?","pt":"Como chego à rodoviária?"},
    {"en":"I am looking for my employer''s driver.","pt":"Estou procurando o motorista do meu empregador."},
    {"en":"His name is John Smith.","pt":"O nome dele é John Smith."}
   ]',
   '[
    {"q":"\"I missed my connection\" é:","options":["Senti falta da conexão","Perdi minha conexão","Liguei para conexão","Aceitei conexão"],"correct":1}
   ]', 4, false),

  ('problemas', 'Quando algo dá errado', 'When something goes wrong',
   'Mala perdida, voo atrasado, ajuda em emergência.',
   '[
    {"en":"My luggage is missing.","pt":"Minha mala sumiu."},
    {"en":"My flight is delayed.","pt":"Meu voo está atrasado."},
    {"en":"Can you help me, please?","pt":"Você pode me ajudar, por favor?"},
    {"en":"I don''t speak much English.","pt":"Eu não falo muito inglês."},
    {"en":"Is there someone who speaks Portuguese?","pt":"Tem alguém que fale português?"}
   ]',
   '[
    {"q":"\"My luggage is missing\" é:","options":["Minha mala chegou","Minha mala sumiu","Minha mala é grande","Minha mala é pesada"],"correct":1},
    {"q":"Pedir ajuda educadamente:","options":["Help me now","Can you help me, please?","I want help","You help"],"correct":1}
   ]', 5, false)
) AS x(slug, title_pt, title_en, intro_pt, phrases, quiz, sort_order, is_free);

WITH m AS (SELECT id FROM public.english_modules WHERE slug='campo')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, intro_pt, phrases, quiz, sort_order, is_free)
SELECT m.id, x.slug, x.title_pt, x.title_en, x.intro_pt, x.phrases::jsonb, x.quiz::jsonb, x.sort_order, x.is_free FROM m, (VALUES
  ('ferramentas', 'Ferramentas e equipamentos', 'Tools & equipment',
   'O nome em inglês das principais ferramentas da fazenda.',
   '[
    {"en":"Tractor","pt":"Trator"},
    {"en":"Harvester","pt":"Colheitadeira"},
    {"en":"Sprayer","pt":"Pulverizador"},
    {"en":"Shovel","pt":"Pá"},
    {"en":"Hoe","pt":"Enxada"},
    {"en":"Bucket","pt":"Balde"},
    {"en":"Ladder","pt":"Escada"},
    {"en":"Gloves","pt":"Luvas"},
    {"en":"Boots","pt":"Botas"}
   ]',
   '[
    {"q":"\"Shovel\" é:","options":["Pá","Enxada","Picareta","Foice"],"correct":0},
    {"q":"\"Gloves\" é:","options":["Botas","Luvas","Capacete","Óculos"],"correct":1},
    {"q":"\"Harvester\" é:","options":["Pulverizador","Trator","Colheitadeira","Caminhão"],"correct":2}
   ]', 1, true),

  ('instrucoes', 'Recebendo instruções', 'Following instructions',
   'Entenda o que o supervisor está pedindo.',
   '[
    {"en":"Pick the ripe fruit only.","pt":"Colha apenas a fruta madura."},
    {"en":"Place it gently in the bucket.","pt":"Coloque com cuidado no balde."},
    {"en":"Don''t damage the plant.","pt":"Não danifique a planta."},
    {"en":"Move to the next row.","pt":"Vá para a próxima fileira."},
    {"en":"Take a break in fifteen minutes.","pt":"Façam uma pausa em quinze minutos."},
    {"en":"Faster, please.","pt":"Mais rápido, por favor."},
    {"en":"Slow down, be careful.","pt":"Vá mais devagar, cuidado."}
   ]',
   '[
    {"q":"\"Pick the ripe fruit only\" significa:","options":["Colha qualquer fruta","Colha apenas a fruta madura","Não colha a fruta","Coma a fruta madura"],"correct":1},
    {"q":"\"Move to the next row\" é:","options":["Vá para a próxima fileira","Mexa na próxima planta","Mude de turno","Suba na escada"],"correct":0}
   ]', 2, true),

  ('seguranca', 'Segurança no trabalho', 'Workplace safety',
   'Vocabulário que pode salvar sua vida ou de um colega.',
   '[
    {"en":"Wear your safety glasses.","pt":"Use seus óculos de segurança."},
    {"en":"Drink water often.","pt":"Beba água com frequência."},
    {"en":"Watch out for snakes.","pt":"Cuidado com cobras."},
    {"en":"That pesticide is dangerous.","pt":"Esse pesticida é perigoso."},
    {"en":"I hurt my hand.","pt":"Machuquei minha mão."},
    {"en":"I need to go to the hospital.","pt":"Preciso ir ao hospital."},
    {"en":"Call the supervisor!","pt":"Chame o supervisor!"}
   ]',
   '[
    {"q":"\"Watch out for snakes\" é:","options":["Procure cobras","Cuidado com cobras","Olhe cobras","Cobras dormem"],"correct":1},
    {"q":"\"I hurt my hand\" significa:","options":["Lavei minha mão","Machuquei minha mão","Levantei minha mão","Perdi minha mão"],"correct":1}
   ]', 3, false),

  ('supervisor', 'Falando com o supervisor', 'Talking to the supervisor',
   'Pedir folga, tirar dúvida, relatar problema.',
   '[
    {"en":"Excuse me, may I ask a question?","pt":"Com licença, posso fazer uma pergunta?"},
    {"en":"I don''t understand. Could you show me?","pt":"Eu não entendi. Pode me mostrar?"},
    {"en":"Can I take a break, please?","pt":"Posso fazer uma pausa, por favor?"},
    {"en":"I am not feeling well today.","pt":"Não estou me sentindo bem hoje."},
    {"en":"I need to talk about my paycheck.","pt":"Preciso falar sobre meu pagamento."},
    {"en":"Thank you for explaining.","pt":"Obrigado pela explicação."}
   ]',
   '[
    {"q":"\"Could you show me?\" significa:","options":["Pode me mostrar?","Pode me contar?","Pode me ensinar amanhã?","Pode me pagar?"],"correct":0},
    {"q":"Pedir uma pausa educadamente:","options":["Break now","Can I take a break, please?","Stop work","Pause please"],"correct":1}
   ]', 4, false),

  ('cotidiano', 'Cotidiano na moradia', 'Daily life in housing',
   'Convivência na casa do trabalhador e compras básicas.',
   '[
    {"en":"Where is the laundry room?","pt":"Onde fica a lavanderia?"},
    {"en":"Can I use the kitchen?","pt":"Posso usar a cozinha?"},
    {"en":"The Wi-Fi password, please.","pt":"A senha do Wi-Fi, por favor."},
    {"en":"How much does this cost?","pt":"Quanto custa isso?"},
    {"en":"Where is the nearest store?","pt":"Onde fica a loja mais próxima?"},
    {"en":"I need to send money to Brazil.","pt":"Preciso enviar dinheiro para o Brasil."}
   ]',
   '[
    {"q":"\"How much does this cost?\" é:","options":["Quanto custa isso?","Quantos tem isso?","Que custo isso?","Como custa?"],"correct":0},
    {"q":"\"Laundry room\" é:","options":["Quarto de dormir","Cozinha","Lavanderia","Banheiro"],"correct":2}
   ]', 5, false)
) AS x(slug, title_pt, title_en, intro_pt, phrases, quiz, sort_order, is_free);
