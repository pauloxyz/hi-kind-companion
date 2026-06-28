
-- ============ Schema additions ============
ALTER TABLE public.english_modules
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'basico'
    CHECK (level IN ('basico','intermediario','avancado'));

ALTER TABLE public.english_lessons
  ADD COLUMN IF NOT EXISTS goal_pt text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dialogue jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS grammar_tip text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pronunciation_tip text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS common_mistakes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cultural_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimated_minutes int NOT NULL DEFAULT 12;

-- ============ Wipe existing seed (lessons cascade-progress will also clear) ============
DELETE FROM public.english_lessons;
DELETE FROM public.english_modules;

-- ============ Modules (9 modules, 3 levels) ============
INSERT INTO public.english_modules (slug, title_pt, title_en, description_pt, icon, sort_order, level) VALUES
  -- Básico
  ('primeiros-contatos', 'Primeiros Contatos', 'First Contact', 'O essencial pra qualquer conversa: cumprimentar, se apresentar e pedir para repetir.', 'Sparkles', 1, 'basico'),
  ('sobrevivencia', 'Sobrevivência', 'Survival English', 'Comida, banheiro, ajuda, dinheiro e direções — o inglês que evita aperto.', 'LifeBuoy', 2, 'basico'),
  -- Intermediário
  ('entrevista-h2a', 'Entrevista H-2A', 'H-2A Job Interview', 'Como passar segurança e profissionalismo na ligação/videochamada com o empregador.', 'Briefcase', 3, 'intermediario'),
  ('aeroporto-imigracao', 'Aeroporto e Imigração', 'Airport & Immigration', 'Check-in, oficial CBP, alfândega e o que fazer se algo der errado.', 'Plane', 4, 'intermediario'),
  ('trabalho-campo', 'Trabalho no Campo', 'Field Work', 'Ferramentas, instruções, segurança e comunicação com o supervisor.', 'Tractor', 5, 'intermediario'),
  ('vida-diaria', 'Vida Diária nos EUA', 'Daily Life in the US', 'Moradia, supermercado, banco e como mandar dinheiro para casa.', 'Home', 6, 'intermediario'),
  -- Avançado
  ('direitos-negociacao', 'Direitos e Negociação', 'Rights & Negotiation', 'Conhecer seus direitos, negociar pagamento e relatar abuso sem medo.', 'Scale', 7, 'avancado'),
  ('ingles-real', 'Inglês Americano Real', 'Real American English', 'Connected speech (gonna, wanna), phrasal verbs e small talk como nativo.', 'Mic', 8, 'avancado'),
  ('lideranca-retorno', 'Liderança e Retorno', 'Leadership & Returning', 'Treinar colegas novatos, falar com confiança e renovar o visto ano após ano.', 'Award', 9, 'avancado');

-- ============ Helper to seed lessons compactly ============
-- Format per lesson row (as VALUES tuple):
-- (slug, title_pt, title_en, goal_pt, intro_pt, chunks_json, dialogue_json,
--  grammar_tip, pronunciation_tip, common_mistakes_json, cultural_note,
--  quiz_json, sort_order, is_free, minutes)

-- ===== BÁSICO • Primeiros Contatos =====
WITH m AS (SELECT id FROM public.english_modules WHERE slug='primeiros-contatos')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes)
SELECT m.id, x.* FROM m, (VALUES
(
 'apresentacao', 'Se apresentar com confiança', 'Introducing yourself with confidence',
 'Você vai conseguir se apresentar, dizer de onde é, perguntar o nome da pessoa e cumprimentar de volta — sem travar.',
 'A primeira impressão é decisiva. Vamos focar em chunks que americanos USAM de verdade, não no inglês de livro escolar.',
 '[
  {"en":"Hi, I''m Paulo.","pt":"Oi, eu sou o Paulo.","phonetic":"Rái, áim Páulo"},
  {"en":"Nice to meet you.","pt":"Prazer em conhecê-lo.","phonetic":"Náiss tchu mítchu"},
  {"en":"What''s your name?","pt":"Qual é o seu nome?","phonetic":"Uátis iór neim?"},
  {"en":"Where are you from?","pt":"De onde você é?","phonetic":"Uér âr iu fróm?"},
  {"en":"I''m from Brazil.","pt":"Eu sou do Brasil.","phonetic":"Áim fróm Brâzíu"},
  {"en":"Sorry, could you repeat that?","pt":"Desculpe, pode repetir?","phonetic":"Sóri, kud iu rrepítchéat?"}
 ]'::jsonb,
 '[
  {"speaker":"Boss","en":"Hi, I''m John. Nice to meet you.","pt":"Oi, sou o John. Prazer."},
  {"speaker":"Você","en":"Hi John, I''m Paulo. Nice to meet you too.","pt":"Oi John, sou o Paulo. Prazer em conhecê-lo também."},
  {"speaker":"Boss","en":"Where are you from, Paulo?","pt":"De onde você é, Paulo?"},
  {"speaker":"Você","en":"I''m from Minas Gerais, in Brazil. And you?","pt":"Sou de Minas Gerais, no Brasil. E o senhor?"},
  {"speaker":"Boss","en":"I''m from California. Welcome to the team.","pt":"Sou da Califórnia. Bem-vindo ao time."},
  {"speaker":"Você","en":"Thank you. I''m happy to be here.","pt":"Obrigado. Estou feliz de estar aqui."}
 ]'::jsonb,
 'Repare que "I am" vira "I''m" (áim) na fala real. Americano NUNCA fala "I am Paulo" pausado — soa robótico. Sempre contraia: I''m, you''re, we''re, they''re.',
 'O "th" de "thank you" não existe em português. Coloque a ponta da língua entre os dentes e sopre. Se travar, "tank you" também funciona (americanos entendem).',
 '[
  {"wrong":"My name is Paulo.","right":"I''m Paulo.","explanation_pt":"\"My name is\" não está errado, mas soa formal/escolar. Americanos dizem \"I''m\" em quase todo contato casual."},
  {"wrong":"I am from of Brazil.","right":"I''m from Brazil.","explanation_pt":"Não existe \"from of\". É só \"from\" + país."},
  {"wrong":"Nice to meet you. (na despedida)","right":"Nice meeting you. (na despedida)","explanation_pt":"Na primeira vez é \"Nice to meet you\". Quando vocês se despedem depois de conversar, é \"Nice meeting you\"."}
 ]'::jsonb,
 'Americanos sorriem e fazem contato visual ao se apresentar — não é falsidade, é educação. Um aperto de mão firme (não esmagador) também é esperado em ambiente de trabalho.',
 '[
  {"q":"Como um americano contrai \"I am\" na fala?","options":["I em","I''m","I are","I have"],"correct":1},
  {"q":"\"Where are you from?\" significa:","options":["Para onde você vai?","De onde você é?","Onde você está?","Quando você veio?"],"correct":1},
  {"q":"Se você não entendeu, peça educadamente:","options":["Speak again!","Sorry, could you repeat that?","What you say?","Repeat me please"],"correct":1}
 ]'::jsonb,
 1, true, 12
),
(
 'numeros-horas', 'Números, horas e datas', 'Numbers, time and dates',
 'Você vai dizer e entender qualquer número até mil, perguntar e responder que horas são, e marcar dia e mês.',
 'Salário, horário de trabalho, data de embarque — tudo passa por número. Errar aqui custa caro.',
 '[
  {"en":"Twenty, thirty, forty, fifty.","pt":"20, 30, 40, 50.","phonetic":"Tuény, théry, fóry, fífty"},
  {"en":"One hundred dollars a day.","pt":"Cem dólares por dia.","phonetic":"Uán rândred dálôrs a déi"},
  {"en":"What time is it?","pt":"Que horas são?","phonetic":"Uát táim ízit?"},
  {"en":"It''s six thirty in the morning.","pt":"São seis e meia da manhã.","phonetic":"Itz síks théry in dâ mórning"},
  {"en":"We start on March fifteenth.","pt":"Começamos no dia 15 de março.","phonetic":"Uí start ón mártch fiftínth"},
  {"en":"My shift ends at four p.m.","pt":"Meu turno termina às quatro da tarde.","phonetic":"Mai shift ends ét fór pi ém"}
 ]'::jsonb,
 '[
  {"speaker":"Supervisor","en":"Your shift starts at six a.m. tomorrow.","pt":"Seu turno começa às seis da manhã amanhã."},
  {"speaker":"Você","en":"Six a.m. — got it. And when does it end?","pt":"Seis da manhã, entendi. E que horas termina?"},
  {"speaker":"Supervisor","en":"Around four thirty p.m.","pt":"Por volta das quatro e meia da tarde."},
  {"speaker":"Você","en":"How much do you pay per hour?","pt":"Quanto vocês pagam por hora?"},
  {"speaker":"Supervisor","en":"Fifteen seventy-five an hour, plus overtime.","pt":"Quinze e setenta e cinco por hora, mais hora extra."},
  {"speaker":"Você","en":"Got it. Thank you.","pt":"Entendi. Obrigado."}
 ]'::jsonb,
 'Para horas, americanos usam "a.m." (madrugada/manhã) e "p.m." (tarde/noite). 6 a.m. = 6 da manhã. 6 p.m. = 6 da tarde. Esqueça o sistema 24 horas — confunde nativos.',
 'Cuidado com a diferença: "thirteen" (13) tem o tônico no FIM (thír-TÍN), enquanto "thirty" (30) tem o tônico no COMEÇO (THÊ-ry). Errar isso pode te fazer perder dinheiro no salário.',
 '[
  {"wrong":"Five hours of the morning","right":"Five in the morning","explanation_pt":"Não existe \"hours of\". Use \"in the morning / in the afternoon / at night\"."},
  {"wrong":"I work for eight hours per day","right":"I work eight hours a day","explanation_pt":"Não precisa \"for\" e \"per\" vira \"a\" na fala diária: \"a day\", \"an hour\"."},
  {"wrong":"It''s ten and half","right":"It''s ten thirty / half past ten","explanation_pt":"Não traduza literal. \"Dez e meia\" vira \"ten thirty\" (mais comum nos EUA)."}
 ]'::jsonb,
 'Pagamento por hora ("hourly rate") é o padrão no H-2A. Pergunte sempre o valor e se inclui hora extra ("overtime", geralmente 1.5x após 40h/semana). Anote tudo.',
 '[
  {"q":"\"Fifteen seventy-five an hour\" é:","options":["$15.75 por hora","$1575 por mês","15 horas por dia","$50.75 por hora"],"correct":0},
  {"q":"Diferença entre 13 e 30 na fala:","options":["Mesma coisa","O tônico muda: thirTEEN x THIRty","13 não existe","30 se diz thrirteen"],"correct":1},
  {"q":"\"Six a.m.\" é:","options":["Seis da tarde","Seis da manhã","Seis horas qualquer","Sexta-feira"],"correct":1}
 ]'::jsonb,
 2, false, 14
),
(
 'soletrar-info', 'Soletrar e dar informações pessoais', 'Spelling & personal info',
 'Você vai soletrar seu nome, dar seu telefone e endereço sem o americano pedir pra repetir 3 vezes.',
 'Quem nunca passou pelo aperto de soletrar o sobrenome no telefone? Vamos resolver isso.',
 '[
  {"en":"How do you spell that?","pt":"Como se soletra isso?","phonetic":"Ráu du iu spél dét?"},
  {"en":"It''s spelled P as in Paul, A, U, L, O.","pt":"Soletra P de Paul, A, U, L, O.","phonetic":"Itz spéld pi és in pól..."},
  {"en":"My phone number is...","pt":"Meu telefone é...","phonetic":"Mai fôun nâmber íz..."},
  {"en":"My address is 123 Main Street.","pt":"Meu endereço é Main Street, 123.","phonetic":"Mai ádres íz uan tu thrí mein strítch"},
  {"en":"Apartment number five.","pt":"Apartamento número cinco.","phonetic":"Apártment nâmber fáiv"},
  {"en":"Can you write it down for me?","pt":"Você pode anotar para mim?","phonetic":"Kén iu ráit it dáun fôr mi?"}
 ]'::jsonb,
 '[
  {"speaker":"Atendente","en":"Can I have your last name, please?","pt":"Pode me passar seu sobrenome?"},
  {"speaker":"Você","en":"Yes, it''s Oliveira.","pt":"Sim, é Oliveira."},
  {"speaker":"Atendente","en":"Could you spell that for me?","pt":"Pode soletrar?"},
  {"speaker":"Você","en":"Sure. O — L — I — V — E — I — R — A.","pt":"Claro. O — L — I — V — E — I — R — A."},
  {"speaker":"Atendente","en":"Got it. And your phone number?","pt":"Anotei. E seu telefone?"},
  {"speaker":"Você","en":"Five five five, two one three, four nine zero zero.","pt":"555, 213, 4900."}
 ]'::jsonb,
 'Em telefones, americanos leem dígito por dígito ("five five five" e não "five hundred fifty-five"). Para o "zero", pode falar "zero" ou "oh" (ô). Os dois funcionam.',
 'Letras tricky pro brasileiro: E (i), I (ái), J (djei), G (dji), H (eitch), W (dâbiu), Y (uái). Decore essas — são as que mais confundem.',
 '[
  {"wrong":"My name spell P-A-U-L-O","right":"It''s spelled P-A-U-L-O / Spell: P-A-U-L-O","explanation_pt":"\"Spell\" é verbo: \"how do you spell\". Pra responder, use \"It''s spelled...\" ou só soletre."},
  {"wrong":"I live in number 123","right":"My address is 123 [street name]","explanation_pt":"Endereço americano: NÚMERO primeiro, depois nome da rua. Sem \"number\"."}
 ]'::jsonb,
 'Nos EUA, sobrenome é "last name" ou "family name". Quando preencher formulários, "first name" = primeiro nome, "middle name" = nome do meio (pode deixar em branco), "last name" = sobrenome.',
 '[
  {"q":"\"How do you spell that?\" significa:","options":["O que isso significa?","Como se soletra isso?","Como se escreve grande?","Como se chama?"],"correct":1},
  {"q":"A letra E em inglês se pronuncia:","options":["É","I","Êi","Eh"],"correct":1},
  {"q":"Telefone americano se lê:","options":["Tudo junto","Dígito por dígito","Em pares","Em centenas"],"correct":1}
 ]'::jsonb,
 3, false, 12
),
(
 'cortesia', 'Polidez americana essencial', 'Essential American politeness',
 'Você vai usar "please", "thank you", "excuse me" e "I''m sorry" como nativo — sem soar nem grosso nem servil.',
 'Americano pede DESCULPA até pra coisas que brasileiro nem perceberia. Entender isso muda como te tratam.',
 '[
  {"en":"Please / Thank you / You''re welcome.","pt":"Por favor / Obrigado / De nada.","phonetic":"Plíz / Théngkiu / Iór uélkâm"},
  {"en":"Excuse me, can I get by?","pt":"Com licença, posso passar?","phonetic":"Ekskiúz mi, kén ái guét bái?"},
  {"en":"I''m sorry, my bad.","pt":"Desculpa, foi mal.","phonetic":"Áim sóri, mai béd"},
  {"en":"Could you help me, please?","pt":"Você pode me ajudar, por favor?","phonetic":"Kud iu rrelp mi plíz?"},
  {"en":"No problem!","pt":"Sem problema!","phonetic":"Nôu próblem"},
  {"en":"I appreciate it.","pt":"Eu agradeço.","phonetic":"Ái âprí-shi-eit it"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Excuse me, sorry — could you help me for a second?","pt":"Com licença, desculpa — pode me ajudar um segundo?"},
  {"speaker":"Colega","en":"Sure, what''s up?","pt":"Claro, o que foi?"},
  {"speaker":"Você","en":"I can''t find the bucket. Do you know where it is?","pt":"Não acho o balde. Sabe onde está?"},
  {"speaker":"Colega","en":"It''s over there, by the truck.","pt":"Tá ali, perto do caminhão."},
  {"speaker":"Você","en":"Oh great, thank you so much! I appreciate it.","pt":"Ah ótimo, muito obrigado! Eu agradeço."},
  {"speaker":"Colega","en":"No problem.","pt":"De nada."}
 ]'::jsonb,
 '"Could" é a versão educada de "can". "Can you help me?" = ok. "Could you help me, please?" = bem mais educado. No trabalho, sempre prefira "could".',
 'O "T" entre vogais nos EUA vira som de "D": "water" = "uá-DÊR", "better" = "bé-DÊR", "appreciate it" = "âprí-shi-éi-DIT". Solta esse T-rígido britânico.',
 '[
  {"wrong":"Thanks God!","right":"Thank God!","explanation_pt":"Sem \"s\". É \"thank God\" (graças a Deus)."},
  {"wrong":"Please, can you... (no fim da frase)","right":"Can you..., please?","explanation_pt":"\"Please\" no inglês americano costuma vir no FIM da frase, não no começo."},
  {"wrong":"Imagine!","right":"Don''t mention it / No problem","explanation_pt":"\"Imagina!\" em resposta a obrigado não funciona em inglês. Use \"no problem\" ou \"don''t mention it\"."}
 ]'::jsonb,
 'Americanos dizem "sorry" o tempo todo — esbarrar no shopping, pedir pra repetir, interromper. NÃO é fraqueza, é o lubrificante social. Use sem medo.',
 '[
  {"q":"Para pedir ajuda educadamente:","options":["Help me now","Could you help me, please?","I need help fast","You help"],"correct":1},
  {"q":"\"Water\" pronunciado pelo americano é:","options":["UÁ-tér","UÁ-dêr","UÉI-ter","VÁ-ter"],"correct":1},
  {"q":"Resposta correta a \"Thank you\":","options":["Imagine!","No problem","I thank","Yes please"],"correct":1}
 ]'::jsonb,
 4, false, 11
)
) AS x(slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes);

-- ===== BÁSICO • Sobrevivência =====
WITH m AS (SELECT id FROM public.english_modules WHERE slug='sobrevivencia')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes)
SELECT m.id, x.* FROM m, (VALUES
(
 'pedir-ajuda', 'Pedir ajuda e o banheiro', 'Asking for help & the bathroom',
 'Você vai pedir ajuda em qualquer situação e achar o banheiro em qualquer lugar dos EUA.',
 'Essas frases parecem bobas, mas no momento do aperto SALVAM. Decore.',
 '[
  {"en":"Excuse me, can you help me?","pt":"Com licença, pode me ajudar?","phonetic":"Ekskiúz mi, kén iu rrélp mi?"},
  {"en":"Where is the bathroom?","pt":"Onde fica o banheiro?","phonetic":"Uér iz dâ béth-rum?"},
  {"en":"Where is the restroom, please?","pt":"Onde é o banheiro, por favor?","phonetic":"Uér iz dâ rést-rum, plíz?"},
  {"en":"I don''t speak much English.","pt":"Eu não falo muito inglês.","phonetic":"Ai dônt spíki mâtch ínglish"},
  {"en":"Do you speak Portuguese / Spanish?","pt":"Você fala português / espanhol?","phonetic":"Du iu spíki pórtchu-guíz / spénish?"},
  {"en":"Can you say that again, more slowly?","pt":"Pode dizer de novo, mais devagar?","phonetic":"Kén iu sei dét aguên, mór slôuli?"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Excuse me, where is the restroom?","pt":"Com licença, onde fica o banheiro?"},
  {"speaker":"Funcionário","en":"It''s down the hall, on your right.","pt":"É no fim do corredor, à direita."},
  {"speaker":"Você","en":"Sorry, could you say that again, more slowly?","pt":"Desculpa, pode repetir mais devagar?"},
  {"speaker":"Funcionário","en":"Sure. Go straight, and turn right at the end.","pt":"Claro. Vá reto e vire à direita no fim."},
  {"speaker":"Você","en":"Thank you so much!","pt":"Muito obrigado!"}
 ]'::jsonb,
 'Em ambiente público (restaurante, posto, shopping), "restroom" é mais educado que "bathroom" (que dá ideia de banheiro de CASA, com banheira). Em casa, "bathroom" é normal.',
 '"Th" de "bathroom" e "thirty" — coloca a língua entre os dentes e sopra. Se ainda não dominar, "baf-rum" passa.',
 '[
  {"wrong":"Where is the toilet?","right":"Where is the restroom? / bathroom?","explanation_pt":"\"Toilet\" é a privada em si. Pedir o \"toilet\" soa esquisito — americano usa \"restroom\" ou \"bathroom\"."},
  {"wrong":"I no understand","right":"I don''t understand","explanation_pt":"Sempre use \"don''t\" (do not) para negativa. \"I no\" é erro clássico de brasileiro."}
 ]'::jsonb,
 'É TOTALMENTE NORMAL parar qualquer pessoa na rua nos EUA com "Excuse me" — eles ajudam. Não tenha vergonha de dizer que fala pouco inglês.',
 '[
  {"q":"Forma mais educada de pedir banheiro em loja:","options":["Where toilet?","Where is the restroom, please?","I need bathroom","Toilet please"],"correct":1},
  {"q":"\"I don''t speak much English\" significa:","options":["Eu não falo inglês","Eu falo muito inglês","Eu não falo muito inglês","Não entendo inglês"],"correct":2},
  {"q":"Forma negativa correta:","options":["I no speak","I don''t speak","I not speak","I am no speak"],"correct":1}
 ]'::jsonb,
 1, true, 11
),
(
 'comida-restaurante', 'Comida e restaurante', 'Food & restaurant',
 'Você vai conseguir pedir comida, pagar a conta e dar gorjeta — sem mal-entendido.',
 'Tipping (gorjeta) confunde muito brasileiro. Vamos resolver junto.',
 '[
  {"en":"I''d like a hamburger and a Coke, please.","pt":"Eu queria um hambúrguer e uma Coca, por favor.","phonetic":"Áid láik a rrémburguer end a Kôuk, plíz"},
  {"en":"For here or to go?","pt":"Pra comer aqui ou pra viagem?","phonetic":"Fôr rrír or tu gou?"},
  {"en":"To go, please.","pt":"Pra viagem, por favor.","phonetic":"Tu gou, plíz"},
  {"en":"How much is it?","pt":"Quanto custa?","phonetic":"Ráu mâtch ízit?"},
  {"en":"Can I have the check, please?","pt":"A conta, por favor.","phonetic":"Kén ái rrév dâ tchéque, plíz?"},
  {"en":"Keep the change.","pt":"Pode ficar com o troco.","phonetic":"Kíp dâ tchéindj"}
 ]'::jsonb,
 '[
  {"speaker":"Atendente","en":"Hi! What can I get for you?","pt":"Oi! O que posso pegar pra você?"},
  {"speaker":"Você","en":"Hi. I''d like a cheeseburger and a small Coke, please.","pt":"Oi. Queria um cheeseburger e uma Coca pequena."},
  {"speaker":"Atendente","en":"For here or to go?","pt":"Pra comer aqui ou pra viagem?"},
  {"speaker":"Você","en":"To go, please.","pt":"Pra viagem."},
  {"speaker":"Atendente","en":"That''ll be eight forty-five.","pt":"Vai dar oito e quarenta e cinco."},
  {"speaker":"Você","en":"Here you go. Thank you!","pt":"Aqui está. Obrigado!"}
 ]'::jsonb,
 '"I''d like" é a contração de "I would like" — bem mais educado que "I want". Em qualquer pedido (comida, ajuda, informação), prefira "I''d like".',
 '"Cheeseburger" — americano não pronuncia "ch" igual nós. É "TCHÍZ-bêr-guer". Pratique o som "tch".',
 '[
  {"wrong":"I want hamburger","right":"I''d like a hamburger / Can I get a hamburger","explanation_pt":"\"I want\" soa rude em restaurante. Sempre \"I''d like\" ou \"Can I get\"."},
  {"wrong":"The bill, please (nos EUA)","right":"The check, please","explanation_pt":"No Reino Unido é \"bill\". Nos EUA é \"check\". Use o termo americano."}
 ]'::jsonb,
 'GORJETA NOS EUA NÃO É OPCIONAL em restaurante com mesa. Mínimo 15%, normal 18-20%. Em fast-food (balcão) NÃO precisa. Garçom americano ganha quase só de gorjeta.',
 '[
  {"q":"\"For here or to go?\" significa:","options":["Aqui ou ali?","Comer aqui ou viagem?","Hoje ou amanhã?","Você ou eu?"],"correct":1},
  {"q":"Pedido educado em restaurante:","options":["I want a burger","I''d like a burger","Give me a burger","Burger now"],"correct":1},
  {"q":"\"The check\" em restaurante americano é:","options":["O cheque","A conta","O cardápio","O pedido"],"correct":1}
 ]'::jsonb,
 2, false, 13
),
(
 'dinheiro-compras', 'Dinheiro e compras', 'Money & shopping',
 'Você vai entender preços em dólar, comprar no mercado e perguntar se aceita cartão.',
 'Preço nos EUA é sempre SEM o imposto na etiqueta — soma na hora de pagar. Cuidado.',
 '[
  {"en":"How much does this cost?","pt":"Quanto custa isto?","phonetic":"Ráu mâtch dâz dis kóst?"},
  {"en":"Do you take credit cards?","pt":"Vocês aceitam cartão de crédito?","phonetic":"Du iu téik krédit kárds?"},
  {"en":"Cash or card?","pt":"Dinheiro ou cartão?","phonetic":"Kéesh ór kárd?"},
  {"en":"Cash, please.","pt":"Dinheiro, por favor.","phonetic":"Kéesh, plíz"},
  {"en":"Can I get a receipt?","pt":"Pode me dar um recibo?","phonetic":"Kén ái guét a rissít?"},
  {"en":"That''s too expensive.","pt":"Isso é caro demais.","phonetic":"Détz tu ekspénsiv"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Excuse me, how much are these boots?","pt":"Com licença, quanto custam essas botas?"},
  {"speaker":"Vendedor","en":"They''re forty-nine ninety-nine.","pt":"Estão por 49 e 99."},
  {"speaker":"Você","en":"OK. Do you take credit cards?","pt":"Ok. Aceitam cartão de crédito?"},
  {"speaker":"Vendedor","en":"Yes, we take all major cards.","pt":"Sim, aceitamos todos os principais."},
  {"speaker":"Você","en":"Great. I''ll take them. And can I get a receipt?","pt":"Ótimo. Vou levar. Pode me dar o recibo?"},
  {"speaker":"Vendedor","en":"Of course. Here you go.","pt":"Claro. Aqui está."}
 ]'::jsonb,
 '"This / that" (singular) virou "these / those" (plural). "How much does THIS cost?" / "How much do THESE cost?". Verbo muda de "does" pra "do".',
 'Preços com vírgula nos EUA: ".99" se lê "ninety-nine cents" ou apenas "ninety-nine". $49.99 = "forty-nine ninety-nine".',
 '[
  {"wrong":"How much cost?","right":"How much does it cost? / How much is it?","explanation_pt":"Sempre precisa do auxiliar \"does\" ou do verbo \"is\"."},
  {"wrong":"Take a receipt?","right":"Can I get a receipt?","explanation_pt":"\"Receipt\" se pega (get), não se toma (take)."}
 ]'::jsonb,
 'Imposto (sales tax) varia de estado pra estado — 0% a 10%. Se a etiqueta diz $10, prepare-se pra pagar $10,50-$11. Não é golpe, é normal.',
 '[
  {"q":"\"How much does it cost?\" é:","options":["Quanto custa?","Quanto pesa?","Onde fica?","De que é feito?"],"correct":0},
  {"q":"$24.99 se lê:","options":["Vinte e quatro vírgula nove","Twenty-four ninety-nine","Two four nine","Twenty four point nine nine"],"correct":1},
  {"q":"Pedir o recibo:","options":["Give me receipt","Can I get a receipt?","I want paper","Receipt me"],"correct":1}
 ]'::jsonb,
 3, false, 12
),
(
 'direcoes', 'Pedir e entender direções', 'Asking & understanding directions',
 'Você vai pedir como chegar a um lugar e entender as instruções (direita, esquerda, quadras).',
 'Mesmo com GPS no celular, vai ter hora que precisará perguntar. Vamos lá.',
 '[
  {"en":"How do I get to the bus station?","pt":"Como chego à rodoviária?","phonetic":"Ráu du ái guét tu dâ bâs steishon?"},
  {"en":"Is it far from here?","pt":"É longe daqui?","phonetic":"Iz it fár fróm rír?"},
  {"en":"Go straight, then turn left.","pt":"Siga reto, depois vire à esquerda.","phonetic":"Gou stréit, dén tern léft"},
  {"en":"Take the second right.","pt":"Pegue a segunda à direita.","phonetic":"Téik dâ sékond ráit"},
  {"en":"It''s two blocks away.","pt":"É a duas quadras daqui.","phonetic":"Itz tu bláks auêi"},
  {"en":"You can''t miss it.","pt":"Tem como você não ver (é fácil de achar).","phonetic":"Iu kéntch míss it"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Excuse me, how do I get to Walmart?","pt":"Com licença, como chego ao Walmart?"},
  {"speaker":"Estranho","en":"It''s about three blocks from here. Go straight on this street.","pt":"Fica a uns três quarteirões. Siga reto por essa rua."},
  {"speaker":"Estranho","en":"Then turn right at the gas station.","pt":"Depois vire à direita no posto."},
  {"speaker":"Você","en":"Right at the gas station. Got it.","pt":"À direita no posto. Entendi."},
  {"speaker":"Estranho","en":"You''ll see it on your left. You can''t miss it.","pt":"Vai ver à sua esquerda. Tem como não ver."},
  {"speaker":"Você","en":"Thank you so much!","pt":"Muito obrigado!"}
 ]'::jsonb,
 'Para indicar distância em quadras, americano usa "block" — "two blocks", "three blocks". 1 block ≈ 80-100 metros. Em estradas, usa "miles" (1 mile = 1,6 km).',
 'O som de "L" no FIM da palavra ("call", "tell", "Brazil") é diferente do "L" no começo. Levanta o fundo da língua. Sem fazer isso, vira "Brazow" pro americano.',
 '[
  {"wrong":"Where stays the bank?","right":"Where is the bank? / Where''s the bank?","explanation_pt":"\"Stays\" não se usa pra lugar. É só \"Where is\"."},
  {"wrong":"Turn to right","right":"Turn right","explanation_pt":"Sem \"to\". \"Turn right / turn left\"."}
 ]'::jsonb,
 'Americano costuma dar direção em referências visuais (posto, McDonald''s, semáforo) — não em nome de rua. Anote os pontos de referência.',
 '[
  {"q":"\"Turn left\" é:","options":["Saia à esquerda","Vire à esquerda","Volte à esquerda","Deixe à esquerda"],"correct":1},
  {"q":"\"Two blocks away\" significa:","options":["Dois bloqueios","Duas quadras de distância","Dois minutos","Duas horas"],"correct":1},
  {"q":"\"You can''t miss it\" quer dizer:","options":["Você não pode perder","É fácil de achar","Não dá pra fazer","Não pode errar"],"correct":1}
 ]'::jsonb,
 4, false, 12
)
) AS x(slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes);

-- ===== INTERMEDIÁRIO • Entrevista H-2A =====
WITH m AS (SELECT id FROM public.english_modules WHERE slug='entrevista-h2a')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes)
SELECT m.id, x.* FROM m, (VALUES
(
 'apresentacao-experiencia', 'Apresentação + experiência', 'Self-intro + experience',
 'Você vai se apresentar profissionalmente e descrever sua experiência rural em 30 segundos — o "elevator pitch" do trabalhador H-2A.',
 'Empregador americano decide em 1 minuto se quer continuar a entrevista. Você precisa entregar tudo de relevante NESSE minuto.',
 '[
  {"en":"Thank you for taking the time to speak with me.","pt":"Obrigado por reservar um tempo para falar comigo.","phonetic":"Théngkiu fôr téiking dâ táim tu spíki uithh mi"},
  {"en":"I have ten years of experience in agriculture.","pt":"Tenho dez anos de experiência na agricultura.","phonetic":"Ái rév tén iers óv ekspírians in ágrikalcher"},
  {"en":"I''ve worked with coffee, oranges and corn.","pt":"Já trabalhei com café, laranjas e milho.","phonetic":"Áiv uérkt uith káfi, óranjes end córn"},
  {"en":"I can operate a tractor and a sprayer.","pt":"Sei operar trator e pulverizador.","phonetic":"Ái kén óperéit a tráktor end a spréi-ér"},
  {"en":"I''m hardworking and reliable.","pt":"Sou trabalhador e confiável.","phonetic":"Áim rárd-uêrking end rilái-âbôl"},
  {"en":"I''m available to start anytime.","pt":"Estou disponível para começar a qualquer momento.","phonetic":"Áim avéilabôl tu start éni-táim"}
 ]'::jsonb,
 '[
  {"speaker":"Empregador","en":"Hi Paulo, thanks for joining the call. Tell me about yourself.","pt":"Oi Paulo, obrigado por entrar. Me fala sobre você."},
  {"speaker":"Você","en":"Thank you for the opportunity, sir. My name is Paulo, I''m 32, and I''m from Minas Gerais, Brazil.","pt":"Obrigado pela oportunidade, senhor. Sou Paulo, 32 anos, de Minas Gerais, Brasil."},
  {"speaker":"Você","en":"I have ten years of experience in agriculture. I''ve worked with coffee, oranges and corn on a 200-hectare farm.","pt":"Tenho dez anos de experiência na agricultura. Já trabalhei com café, laranjas e milho em uma fazenda de 200 hectares."},
  {"speaker":"Você","en":"I can operate a tractor and a sprayer, and I''m used to long hours in the sun.","pt":"Sei operar trator e pulverizador, e estou acostumado a trabalhar muitas horas no sol."},
  {"speaker":"Empregador","en":"Great. That''s exactly what we''re looking for.","pt":"Ótimo. É exatamente o que estamos procurando."},
  {"speaker":"Você","en":"Thank you. I''m ready to work hard and learn anything you need.","pt":"Obrigado. Estou pronto para trabalhar duro e aprender o que for preciso."}
 ]'::jsonb,
 'Present perfect ("I''ve worked", "I''ve done") mostra experiência ACUMULADA — perfeito pra falar de carreira. "I worked with coffee" (passado simples) sugere algo acabado. "I''ve worked with coffee" sugere experiência viva, contínua. Use o present perfect na entrevista.',
 'Pratique a contração "I''ve" (áiv). Brasileiro tende a dizer "I have" pausado, o que soa robótico. Diga "áiv uêrkt" tudo junto.',
 '[
  {"wrong":"I have 10 years working with farm","right":"I have 10 years of experience in agriculture","explanation_pt":"Estrutura correta: \"X years OF experience IN [área]\"."},
  {"wrong":"I am working hard man","right":"I''m a hard worker / I''m hardworking","explanation_pt":"\"Hard working man\" soa estranho. Use \"hardworking\" como adjetivo ou \"a hard worker\" como substantivo."},
  {"wrong":"I have experience in plant coffee","right":"I have experience planting coffee","explanation_pt":"Depois de \"experience in\", verbo termina em -ing (gerúndio)."}
 ]'::jsonb,
 'Empregador americano valoriza HUMILDADE + CONFIANÇA juntas. Não se gabe ("I''m the best"), mas também não se diminua ("I don''t know much"). Seja factual: anos, culturas, equipamentos.',
 '[
  {"q":"\"I have 10 years of experience in agriculture\" é:","options":["Tenho 10 anos trabalhando","Tenho 10 anos de experiência na agricultura","10 anos para mim","Trabalho 10 anos por dia"],"correct":1},
  {"q":"Forma natural de dizer experiência acumulada:","options":["I work with coffee","I worked with coffee","I''ve worked with coffee","I will work with coffee"],"correct":2},
  {"q":"\"I''m available to start anytime\" significa:","options":["Estou ocupado","Posso começar a qualquer momento","Não posso começar","Começo amanhã"],"correct":1}
 ]'::jsonb,
 1, true, 15
),
(
 'perguntas-respostas', 'Perguntas difíceis e respostas fortes', 'Tough questions, strong answers',
 'Você vai responder as 7 perguntas mais comuns sem hesitação: passaporte, saúde, primeira vez, motivo, etc.',
 'Treine essas respostas até saber de cabeça. Hesitação assusta o empregador.',
 '[
  {"en":"Yes, I have a valid passport.","pt":"Sim, tenho passaporte válido.","phonetic":"Iés, ái rév a válid pásport"},
  {"en":"No, this is my first time, but I''m a fast learner.","pt":"Não, é minha primeira vez, mas aprendo rápido.","phonetic":"Nôu, dis íz mai fêrst táim, bât áim a fést lêrner"},
  {"en":"I''m healthy and physically fit.","pt":"Sou saudável e estou em forma.","phonetic":"Áim rrél-thi end fízikli fit"},
  {"en":"Yes, I can start in March.","pt":"Sim, posso começar em março.","phonetic":"Iés, ái kén start in mártch"},
  {"en":"Yes, I''m willing to work weekends and overtime.","pt":"Sim, estou disposto a trabalhar fins de semana e horas extras.","phonetic":"Iés, áim uíling tu uêrk uíkends end óvertáim"},
  {"en":"I want this job to support my family back home.","pt":"Quero este trabalho para sustentar minha família no Brasil.","phonetic":"Ai uánt dis djób tu sâport mai fémili béki rôum"}
 ]'::jsonb,
 '[
  {"speaker":"Empregador","en":"Have you ever worked in the United States before?","pt":"Você já trabalhou nos EUA antes?"},
  {"speaker":"Você","en":"No sir, this is my first time, but I''m a fast learner and very motivated.","pt":"Não senhor, é minha primeira vez, mas aprendo rápido e estou muito motivado."},
  {"speaker":"Empregador","en":"Do you have any health problems?","pt":"Você tem algum problema de saúde?"},
  {"speaker":"Você","en":"No, I''m healthy and physically fit. I can work long hours.","pt":"Não, sou saudável e estou em forma. Posso trabalhar muitas horas."},
  {"speaker":"Empregador","en":"Why do you want this job?","pt":"Por que você quer esse trabalho?"},
  {"speaker":"Você","en":"I want this job to support my family back home and to learn from American farming.","pt":"Quero este trabalho para sustentar minha família e aprender com a agricultura americana."}
 ]'::jsonb,
 '"Have you ever..." pergunta sobre EXPERIÊNCIA DE VIDA (já fez alguma vez?). Resposta usa o mesmo tempo: "Yes, I have" / "No, I haven''t" / "No, this is my first time".',
 'Pratique o "th" de "healthy" e "thank you". Língua entre os dentes. É o som que mais delata sotaque brasileiro.',
 '[
  {"wrong":"I never worked in EUA","right":"I''ve never worked in the US / This is my first time","explanation_pt":"Diga \"the US\" ou \"the United States\". \"EUA\" não existe em inglês. E use present perfect."},
  {"wrong":"Yes, I am very forced!","right":"Yes, I''m very motivated / committed","explanation_pt":"\"Forçado\" não traduz pra \"forced\" (que significa obrigado contra a vontade). Use \"motivated\" ou \"committed\"."}
 ]'::jsonb,
 'Americano valoriza respostas DIRETAS. "Yes" ou "No" sempre primeiro, depois explicação curta. Evite rodeios — soa como se estivesse escondendo algo.',
 '[
  {"q":"Boa resposta para \"Why do you want this job?\":","options":["I need money","I want this job to support my family back home","I have no choice","Because it''s easy"],"correct":1},
  {"q":"\"Have you ever worked in the US?\" — boa resposta:","options":["Yes, I am working","No, this is my first time","Yes, I will","No, I don''t want"],"correct":1},
  {"q":"\"I''m a fast learner\" significa:","options":["Aprendo rápido","Sou rápido","Corro rápido","Sou jovem"],"correct":0}
 ]'::jsonb,
 2, false, 15
),
(
 'salario-condicoes', 'Salário, moradia e horas', 'Pay, housing & hours',
 'Você vai PERGUNTAR (sem medo) sobre pagamento, moradia, transporte e horas — e entender as respostas.',
 'Empregador SÉRIO RESPEITA quem faz perguntas. Empregador desonesto se irrita. Use isso como filtro.',
 '[
  {"en":"What is the hourly rate?","pt":"Qual é o valor por hora?","phonetic":"Uát íz dâ áuârli reit?"},
  {"en":"How many hours per week?","pt":"Quantas horas por semana?","phonetic":"Ráu méni áuârs per uík?"},
  {"en":"Is overtime paid?","pt":"As horas extras são pagas?","phonetic":"Iz óvertáim péid?"},
  {"en":"Is housing provided?","pt":"A moradia é fornecida?","phonetic":"Iz ráuzing prováided?"},
  {"en":"Is there a cost for housing?","pt":"Tem custo pela moradia?","phonetic":"Iz dér a kóst fôr ráuzing?"},
  {"en":"How will I get to the farm from the airport?","pt":"Como vou da fazenda do aeroporto?","phonetic":"Ráu uíl ái guét tu dâ fárm fróm dâ érport?"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Sir, could I ask a few questions about the job?","pt":"Senhor, posso fazer algumas perguntas sobre o trabalho?"},
  {"speaker":"Empregador","en":"Of course, go ahead.","pt":"Claro, pode."},
  {"speaker":"Você","en":"What''s the hourly rate, and is overtime paid?","pt":"Qual o valor por hora, e horas extras são pagas?"},
  {"speaker":"Empregador","en":"Sixteen dollars an hour, time and a half after 40 hours.","pt":"Dezesseis dólares por hora, uma vez e meia depois de 40 horas."},
  {"speaker":"Você","en":"Got it. And is housing provided? Is there a cost?","pt":"Entendi. E a moradia é fornecida? Tem custo?"},
  {"speaker":"Empregador","en":"Yes, free housing in a shared trailer. We also cover transportation from the airport.","pt":"Sim, moradia grátis num trailer compartilhado. Cobrimos transporte do aeroporto também."}
 ]'::jsonb,
 'Para fazer perguntas educadas, use modais: "Could I ask...", "Would it be possible to...". Direto demais ("How much you pay?") soa rude.',
 'Pratique "What''s" (uáts) ao invés de "What is". Americanos contraem 99% das vezes. "What''s the rate?" soa MUITO mais natural.',
 '[
  {"wrong":"How much you pay?","right":"What''s the hourly rate? / How much do you pay per hour?","explanation_pt":"Falta auxiliar. \"How much DO you pay?\" ou prefira a versão mais profissional."},
  {"wrong":"The house is free?","right":"Is housing provided? Is there a cost?","explanation_pt":"\"House\" é uma casa específica. \"Housing\" = moradia em geral, termo técnico do H-2A."}
 ]'::jsonb,
 'Pela lei do H-2A, empregador É OBRIGADO a oferecer moradia GRATUITA ou subsidiada, transporte E reembolso da viagem após 50% do contrato cumprido. Se ele cobra moradia cheia, fuja.',
 '[
  {"q":"\"Is housing provided?\" significa:","options":["A casa é grande?","A moradia é fornecida?","É perto?","Tem que pagar?"],"correct":1},
  {"q":"\"Time and a half\" para hora extra é:","options":["Meia hora","Uma vez e meia o valor","Meio salário","Tempo livre"],"correct":1},
  {"q":"Pergunta educada sobre pagamento:","options":["How much money?","What''s the hourly rate?","Pay how much?","Money please?"],"correct":1}
 ]'::jsonb,
 3, false, 14
)
) AS x(slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes);

-- ===== INTERMEDIÁRIO • Aeroporto e Imigração =====
WITH m AS (SELECT id FROM public.english_modules WHERE slug='aeroporto-imigracao')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes)
SELECT m.id, x.* FROM m, (VALUES
(
 'check-in-embarque', 'Check-in e embarque', 'Check-in & boarding',
 'Você vai despachar mala, escolher assento e entender chamadas no aeroporto.',
 'Pratique o diálogo até automatizar. Você terá MENOS de 2 minutos no balcão.',
 '[
  {"en":"Here''s my passport and ticket.","pt":"Aqui está meu passaporte e passagem.","phonetic":"Rírz mai pásport end tikit"},
  {"en":"I have one bag to check.","pt":"Tenho uma mala para despachar.","phonetic":"Ai rév uan bég tu tchéque"},
  {"en":"Window seat, if possible.","pt":"Assento na janela, se possível.","phonetic":"Uíndou sítch, if pósibôl"},
  {"en":"What gate is the flight?","pt":"Qual o portão do voo?","phonetic":"Uát guéit íz dâ fláit?"},
  {"en":"When does boarding start?","pt":"Que horas começa o embarque?","phonetic":"Uén dâz bórding stárt?"},
  {"en":"Is my bag within the weight limit?","pt":"Minha mala está dentro do limite de peso?","phonetic":"Iz mai bég uithhín dâ uêit límit?"}
 ]'::jsonb,
 '[
  {"speaker":"Atendente","en":"Good morning. Passport and ticket, please.","pt":"Bom dia. Passaporte e passagem."},
  {"speaker":"Você","en":"Here you go. I have one bag to check.","pt":"Aqui está. Tenho uma mala pra despachar."},
  {"speaker":"Atendente","en":"Please place it on the scale. Window or aisle?","pt":"Coloque na balança. Janela ou corredor?"},
  {"speaker":"Você","en":"Window, if possible.","pt":"Janela, se puder."},
  {"speaker":"Atendente","en":"All set. Your gate is B12, boarding starts at 7:15.","pt":"Tudo certo. Portão B12, embarque às 7:15."},
  {"speaker":"Você","en":"Thank you. Have a nice day!","pt":"Obrigado. Tenha um bom dia!"}
 ]'::jsonb,
 'Em frases curtas profissionais, o sujeito pode ser OMITIDO. "Window seat, please" no lugar de "I want a window seat". Soa mais natural no balcão.',
 'Listen-words que vão ditas RÁPIDO: "boarding" (BÓR-ding), "gate" (guéit, NÃO "gueitchi"), "aisle" (áil — o "s" é mudo).',
 '[
  {"wrong":"I want corridor seat","right":"Aisle seat, please","explanation_pt":"Corredor de assento = \"aisle\" (áil). Cuidado: o \"s\" é mudo."},
  {"wrong":"How much weight my bag?","right":"What''s the weight of my bag? / How much does my bag weigh?","explanation_pt":"Verbo \"weigh\" (pesar) ou substantivo \"weight\" (peso) — não use sem o verbo correto."}
 ]'::jsonb,
 'Aeroportos americanos chamam por NOME na fila — escute com atenção. Não tem aquele "atenção senhores passageiros..." longo. Vai direto: "Mr. Silva to gate B12 please."',
 '[
  {"q":"\"Aisle seat\" é:","options":["Assento da janela","Assento do corredor","Assento da frente","Assento de bebê"],"correct":1},
  {"q":"\"What gate is the flight?\" significa:","options":["Que voo é esse?","Qual o portão do voo?","Quando é o voo?","Qual a companhia?"],"correct":1},
  {"q":"\"I have one bag to check\" — \"check\" significa:","options":["Checar dentro do avião","Despachar","Conferir o cartão","Reservar"],"correct":1}
 ]'::jsonb,
 1, true, 12
),
(
 'cbp-imigracao', 'Oficial da imigração (CBP)', 'Immigration officer (CBP)',
 'Você vai responder com firmeza e clareza ao oficial — sem despertar suspeita por insegurança.',
 'O oficial decide se você entra OU NÃO. Olho no olho, respostas curtas, documentos prontos.',
 '[
  {"en":"What''s the purpose of your visit?","pt":"Qual o motivo da sua viagem?","phonetic":"Uátz dâ pêrpâs óv iór vízit?"},
  {"en":"I''m here to work on an H-2A visa.","pt":"Estou aqui para trabalhar com visto H-2A.","phonetic":"Áim rír tu uêrk ón en éitch-tu-éi víza"},
  {"en":"How long are you staying?","pt":"Quanto tempo vai ficar?","phonetic":"Ráu lóng ár iu stéiing?"},
  {"en":"For about nine months, sir.","pt":"Por uns nove meses, senhor.","phonetic":"Fôr abáut náin mântss, ser"},
  {"en":"Where will you be staying?","pt":"Onde vai ficar?","phonetic":"Uér uíl iu bi stéiing?"},
  {"en":"At my employer''s farm in California.","pt":"Na fazenda do meu empregador, na Califórnia.","phonetic":"Ét mai emplóiers fárm in kálifórnia"},
  {"en":"Here''s my contract and the employer letter.","pt":"Aqui está meu contrato e a carta do empregador.","phonetic":"Rírz mai kóntrekt end dâ emplóier léter"}
 ]'::jsonb,
 '[
  {"speaker":"CBP","en":"Passport. What''s the purpose of your visit?","pt":"Passaporte. Qual o motivo da viagem?"},
  {"speaker":"Você","en":"Good morning, sir. I''m here to work on an H-2A visa.","pt":"Bom dia, senhor. Vim trabalhar com visto H-2A."},
  {"speaker":"CBP","en":"Who is your employer?","pt":"Quem é seu empregador?"},
  {"speaker":"Você","en":"Smith Farms LLC, in Fresno, California. Here''s my contract.","pt":"Smith Farms LLC, em Fresno, Califórnia. Aqui está meu contrato."},
  {"speaker":"CBP","en":"How long will you stay?","pt":"Quanto tempo vai ficar?"},
  {"speaker":"Você","en":"For about nine months, sir.","pt":"Cerca de nove meses, senhor."},
  {"speaker":"CBP","en":"Have a good day. Welcome to the United States.","pt":"Tenha um bom dia. Bem-vindo aos EUA."}
 ]'::jsonb,
 'Use "sir" (senhor) ou "ma''am" (méem, senhora) para mostrar respeito ao oficial. NÃO é puxa-saquismo — é cultural americano com autoridade.',
 'Pratique "H-2A" — pronuncia letra por letra em inglês: "éitch tu éi". Não diga "agá dois a" no aeroporto.',
 '[
  {"wrong":"I come work","right":"I''m here to work / I came to work","explanation_pt":"\"Come\" (presente) não funciona aqui. Use \"I''m here to work\" (estou aqui para)."},
  {"wrong":"My boss is John","right":"My employer is Smith Farms / John Smith","explanation_pt":"Para o oficial, prefira \"employer\" (empregador formal) e dê o NOME DA EMPRESA antes do nome pessoal."}
 ]'::jsonb,
 'Tenha SEMPRE em mãos: passaporte com visto, carta do empregador (job offer), contrato e endereço da fazenda. NÃO precisa de tradução juramentada.',
 '[
  {"q":"Para o oficial: \"What''s the purpose of your visit?\" — boa resposta:","options":["Trip","I''m here to work on an H-2A visa","Vacation no","Tourist"],"correct":1},
  {"q":"\"How long are you staying?\" — \"nove meses\" é:","options":["Nine years","Nine days","For about nine months","Nine weeks"],"correct":2},
  {"q":"Forma respeitosa de tratar oficial homem:","options":["Hey man","Sir","Boss","Dude"],"correct":1}
 ]'::jsonb,
 2, false, 14
),
(
 'alfandega-problemas', 'Alfândega, conexão e problemas', 'Customs, connection & problems',
 'Você vai passar pela alfândega, pegar conexão e resolver pepino (mala perdida, voo atrasado).',
 'Tudo que pode dar errado, vai dar errado um dia. Esteja pronto.',
 '[
  {"en":"Do you have anything to declare?","pt":"Tem algo a declarar?","phonetic":"Du iu rév éníthing tu deklér?"},
  {"en":"No, just personal items.","pt":"Não, só itens pessoais.","phonetic":"Nôu, djâst pêrsônôl áitens"},
  {"en":"I''m carrying less than $10,000.","pt":"Estou trazendo menos de dez mil dólares.","phonetic":"Áim kéring léss dén tén thauzând dáliers"},
  {"en":"I missed my connection.","pt":"Perdi minha conexão.","phonetic":"Ai míst mai konékshon"},
  {"en":"My flight was delayed.","pt":"Meu voo atrasou.","phonetic":"Mai fláit uás deléid"},
  {"en":"My luggage is missing.","pt":"Minha mala sumiu.","phonetic":"Mai lâguidj iz míssing"},
  {"en":"Is there anyone who speaks Portuguese?","pt":"Tem alguém que fale português?","phonetic":"Iz dér énniuán rru spíks pórtchu-guíz?"}
 ]'::jsonb,
 '[
  {"speaker":"Atendente","en":"How can I help you?","pt":"Como posso ajudar?"},
  {"speaker":"Você","en":"Hi, my flight was delayed and I missed my connection to Fresno.","pt":"Oi, meu voo atrasou e perdi a conexão pra Fresno."},
  {"speaker":"Atendente","en":"Let me see... I can put you on the next flight at 6 p.m.","pt":"Deixa eu ver... posso te colocar no próximo voo às 18h."},
  {"speaker":"Você","en":"Will I get a meal voucher?","pt":"Vou ganhar voucher de comida?"},
  {"speaker":"Atendente","en":"Yes, here you go. Sorry for the inconvenience.","pt":"Sim, aqui está. Desculpe o transtorno."},
  {"speaker":"Você","en":"Thank you for your help.","pt":"Obrigado pela ajuda."}
 ]'::jsonb,
 'Voz passiva pra problemas: "My flight WAS DELAYED" (meu voo foi atrasado) / "My luggage IS MISSING" (minha mala está sumida). Tira o foco de quem é culpado e foca no problema.',
 'A diferença entre "miss" (perder algo, sentir falta) e "lose" (perder objeto). "I missed my flight" (perdi o voo). "I lost my passport" (perdi o passaporte). Não troque.',
 '[
  {"wrong":"I lost my flight","right":"I missed my flight","explanation_pt":"Perder voo/conexão/ônibus é sempre \"miss\", nunca \"lose\"."},
  {"wrong":"My bag disappeared","right":"My luggage is missing","explanation_pt":"\"Disappeared\" soa dramático. \"Missing\" é o termo padrão no aeroporto."}
 ]'::jsonb,
 'Voo atrasado por culpa da cia aérea (não tempo) te dá direito a comida e às vezes hotel. Pergunte: "Will I get a meal voucher? A hotel voucher?"',
 '[
  {"q":"\"My luggage is missing\" significa:","options":["Minha mala chegou","Minha mala sumiu","Minha mala é cara","Minha mala é grande"],"correct":1},
  {"q":"Diferença entre miss e lose:","options":["Mesma coisa","Miss = perder voo, Lose = perder objeto","Miss = ganhar, Lose = perder","Não tem diferença"],"correct":1},
  {"q":"\"Do you have anything to declare?\" é:","options":["Tem algo a esconder?","Tem algo a declarar?","Quer comprar algo?","Vendeu algo?"],"correct":1}
 ]'::jsonb,
 3, false, 13
)
) AS x(slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes);

-- ===== INTERMEDIÁRIO • Trabalho no Campo =====
WITH m AS (SELECT id FROM public.english_modules WHERE slug='trabalho-campo')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes)
SELECT m.id, x.* FROM m, (VALUES
(
 'ferramentas-equipamentos', 'Ferramentas e equipamentos', 'Tools & equipment',
 'Você vai reconhecer e nomear as ferramentas e equipamentos que o supervisor vai pedir.',
 'Confundir "shovel" e "rake" no campo é vexame. Vamos resolver de uma vez.',
 '[
  {"en":"Tractor / harvester / sprayer","pt":"Trator / colheitadeira / pulverizador","phonetic":"Trákter / rárvester / spréi-er"},
  {"en":"Shovel / hoe / rake","pt":"Pá / enxada / ancinho","phonetic":"Shâvôl / rrôu / réik"},
  {"en":"Bucket / basket / crate","pt":"Balde / cesto / caixa","phonetic":"Bâkit / béskit / kréit"},
  {"en":"Ladder / wheelbarrow","pt":"Escada / carrinho de mão","phonetic":"Léder / uíuel-bárrôu"},
  {"en":"Gloves / boots / hard hat","pt":"Luvas / botas / capacete","phonetic":"Glâvs / butz / rárd rrét"},
  {"en":"Can you hand me the shovel?","pt":"Pode me passar a pá?","phonetic":"Kén iu rrénd mi dâ shâvôl?"}
 ]'::jsonb,
 '[
  {"speaker":"Supervisor","en":"Grab a bucket and gloves before you start.","pt":"Pegue um balde e luvas antes de começar."},
  {"speaker":"Você","en":"Got it. Where are the gloves?","pt":"Entendi. Onde estão as luvas?"},
  {"speaker":"Supervisor","en":"In the shed, on the second shelf.","pt":"No barracão, na segunda prateleira."},
  {"speaker":"Você","en":"Should I also bring the ladder?","pt":"Devo levar a escada também?"},
  {"speaker":"Supervisor","en":"Yes, we need it for the high branches.","pt":"Sim, precisamos pra os galhos altos."},
  {"speaker":"Você","en":"OK, I''ll get everything and meet you in the orchard.","pt":"Ok, vou pegar tudo e te encontro no pomar."}
 ]'::jsonb,
 '"Should I...?" pergunta educada de "devo fazer X?". É melhor que "Do I need to...?" porque mostra iniciativa, não obrigação.',
 'Cuidado com "tools" — fala "tuls" (não "túlês"). E "shovel" começa com som de "Sh" (não "tch").',
 '[
  {"wrong":"Pass me the pá","right":"Pass me the shovel","explanation_pt":"Não misture português no meio. Decore o nome em inglês de cada ferramenta."},
  {"wrong":"I need helmet","right":"I need a hard hat","explanation_pt":"\"Helmet\" existe (capacete de moto), mas no campo é \"hard hat\". Use o termo do setor."}
 ]'::jsonb,
 'Em fazenda americana, EPI (luva, capacete, óculos) é obrigatório por lei (OSHA). Empregador FORNECE — se não fornece, é problema sério, denuncie.',
 '[
  {"q":"\"Hard hat\" é:","options":["Chapéu de couro","Capacete","Chapéu duro","Boné"],"correct":1},
  {"q":"\"Can you hand me the shovel?\" é:","options":["Pode me dar a mão?","Pode me passar a pá?","Pode pegar a mão?","Tem a pá?"],"correct":1},
  {"q":"\"Hoe\" é:","options":["Pá","Enxada","Foice","Ancinho"],"correct":1}
 ]'::jsonb,
 1, true, 12
),
(
 'instrucoes-supervisor', 'Recebendo instruções', 'Following instructions',
 'Você vai entender ordens do supervisor de primeira (ou pedir clarificação SEM parecer lerdo).',
 'Não fingir que entendeu é uma das skills mais importantes. Vamos praticar.',
 '[
  {"en":"Pick only the ripe fruit.","pt":"Colha só a fruta madura.","phonetic":"Pík ônli dâ ráip frut"},
  {"en":"Be careful, don''t damage the plant.","pt":"Cuidado, não danifique a planta.","phonetic":"Bí kérful, dôntch dáme-dj dâ plént"},
  {"en":"Move to the next row.","pt":"Vá para a próxima fileira.","phonetic":"Múv tu dâ nékst rôu"},
  {"en":"Take a 15-minute break.","pt":"Façam 15 minutos de pausa.","phonetic":"Téik a fíftín mínit bréik"},
  {"en":"Could you show me how to do that?","pt":"Pode me mostrar como fazer isso?","phonetic":"Kud iu shôu mi rráu tu du dét?"},
  {"en":"I want to make sure I got it right.","pt":"Quero ter certeza que entendi direito.","phonetic":"Ái uánt tu méik shór ái gát it ráit"}
 ]'::jsonb,
 '[
  {"speaker":"Supervisor","en":"Today you''ll be pruning the vines. Cut at a 45-degree angle.","pt":"Hoje vocês vão podar as videiras. Corte em ângulo de 45 graus."},
  {"speaker":"Você","en":"Sorry, could you show me how to do that? I want to make sure I got it right.","pt":"Desculpe, pode me mostrar? Quero ter certeza."},
  {"speaker":"Supervisor","en":"Sure. Watch me. Like this, OK?","pt":"Claro. Observa. Assim, ok?"},
  {"speaker":"Você","en":"Got it. Like this — angle going down. Right?","pt":"Entendi. Assim, ângulo pra baixo. Certo?"},
  {"speaker":"Supervisor","en":"Perfect. Move to the next row when you''re done.","pt":"Perfeito. Vá para a próxima fileira quando terminar."},
  {"speaker":"Você","en":"Will do. Thanks!","pt":"Pode deixar. Valeu!"}
 ]'::jsonb,
 'Imperativo (instruções) NÃO TEM sujeito: "Pick the fruit", "Move to the next row", "Don''t damage the plant". É a forma padrão de ordens.',
 'O som "ai" em "ripe" e "right" é o ditongo brasileiro "ái". Já o "i" curto de "pick" e "missing" é mais fechado, quase "ê". "Pick" não é "píque", é "pek".',
 '[
  {"wrong":"Yes, I understand (sem ter entendido)","right":"Sorry, could you show me? / Could you repeat that?","explanation_pt":"Fingir que entendeu causa problema GRANDE. É mais profissional pedir pra mostrar uma vez."},
  {"wrong":"Make again, please","right":"Could you do it again, please?","explanation_pt":"\"Make\" não é usado pra \"fazer novamente\". Use \"do it again\"."}
 ]'::jsonb,
 'Americano respeita quem pergunta UMA VEZ pra fazer CERTO. Quem fica perguntando 5 vezes a mesma coisa irrita. Pergunte com calma, anote, e execute.',
 '[
  {"q":"\"Pick only the ripe fruit\" é:","options":["Escolha qualquer fruta","Colha só a fruta madura","Pegue todas as frutas","Não pegue fruta"],"correct":1},
  {"q":"Forma profissional de pedir demonstração:","options":["Show me!","Could you show me how to do that?","Make for me","Help me work"],"correct":1},
  {"q":"\"Move to the next row\" significa:","options":["Mexa-se rápido","Vá pra próxima fileira","Mude o turno","Suba na escada"],"correct":1}
 ]'::jsonb,
 2, false, 14
),
(
 'seguranca-acidente', 'Segurança e relatar acidente', 'Safety & reporting injury',
 'Você vai comunicar perigo, machucado ou problema de segurança IMEDIATAMENTE — em inglês.',
 'Hesitar em emergência pode te custar a saúde. Decore essas frases.',
 '[
  {"en":"Watch out!","pt":"Cuidado!","phonetic":"Uátch áut!"},
  {"en":"That''s dangerous.","pt":"Isso é perigoso.","phonetic":"Détz déin-djerâs"},
  {"en":"I cut my hand.","pt":"Cortei minha mão.","phonetic":"Ai kâtch mai rrênd"},
  {"en":"I need a first aid kit.","pt":"Preciso de um kit de primeiros socorros.","phonetic":"Ai níd a férst eid kit"},
  {"en":"Call the supervisor right now!","pt":"Chame o supervisor agora!","phonetic":"Kól dâ súpervaizor ráit náu!"},
  {"en":"I need to see a doctor.","pt":"Preciso ver um médico.","phonetic":"Ai níd tu sí a dáktor"},
  {"en":"I feel dizzy / sick / weak.","pt":"Estou tonto / passando mal / fraco.","phonetic":"Ai fíl díz-zi / sik / uík"}
 ]'::jsonb,
 '[
  {"speaker":"Colega","en":"Are you OK? You look pale!","pt":"Você está bem? Está pálido!"},
  {"speaker":"Você","en":"I feel dizzy and weak. I think it''s the heat.","pt":"Estou tonto e fraco. Acho que é o calor."},
  {"speaker":"Colega","en":"Sit in the shade. I''ll call the supervisor.","pt":"Senta na sombra. Vou chamar o supervisor."},
  {"speaker":"Supervisor","en":"What happened?","pt":"O que houve?"},
  {"speaker":"Você","en":"I feel dizzy. I need water and a break, please.","pt":"Estou tonto. Preciso de água e uma pausa."},
  {"speaker":"Supervisor","en":"Sure. Take 30 minutes. Drink slowly.","pt":"Claro. Tira 30 minutos. Bebe devagar."}
 ]'::jsonb,
 'Em emergência, use INFINITIVO direto: "Call the doctor!", "Get water!", "Stop the tractor!". Esqueça frases longas.',
 '"Hurt" (rert) e "heart" (rart) são DIFERENTES. "I hurt my hand" (machuquei a mão). Pratique a diferença pra não dizer "machuquei meu coração".',
 '[
  {"wrong":"I am with pain","right":"I''m in pain / It hurts","explanation_pt":"\"Estar com dor\" não traduz literal. Use \"in pain\" ou \"it hurts\"."},
  {"wrong":"Help! Help! Help! (em emergência)","right":"Help! I cut my hand! / I need a doctor!","explanation_pt":"Só gritar \"Help\" gasta tempo. Diga IMEDIATAMENTE o que aconteceu."}
 ]'::jsonb,
 'Pela OSHA, todo acidente de trabalho deve ser RELATADO E DOCUMENTADO. Não esconda machucado por medo — você tem direito a tratamento médico pago pelo empregador.',
 '[
  {"q":"\"I cut my hand\" é:","options":["Cortei minha mão","Bati minha mão","Lavei minha mão","Levantei minha mão"],"correct":0},
  {"q":"\"I feel dizzy\" significa:","options":["Estou triste","Estou tonto","Estou cansado","Estou alegre"],"correct":1},
  {"q":"\"Watch out!\" significa:","options":["Olhe lá fora","Cuidado!","Vigie","Acabou"],"correct":1}
 ]'::jsonb,
 3, false, 13
),
(
 'pausa-pagamento', 'Pausa, pagamento e folga', 'Break, pay & day off',
 'Você vai pedir pausa, esclarecer dúvida no contracheque e pedir folga sem soar mal-educado.',
 'Saber como FALAR sobre dinheiro e tempo é tão importante quanto saber trabalhar.',
 '[
  {"en":"Can I take a quick break?","pt":"Posso fazer uma pausa rápida?","phonetic":"Kén ai téik a kuík bréik?"},
  {"en":"I have a question about my paycheck.","pt":"Tenho uma dúvida sobre meu contracheque.","phonetic":"Ai rév a kuéstchen abáut mai péi-tchéque"},
  {"en":"My hours don''t match what I worked.","pt":"Minhas horas não batem com o que eu trabalhei.","phonetic":"Mai áuârs dôntch métch uát ai uêrkt"},
  {"en":"Could I take Sunday off?","pt":"Eu poderia tirar domingo de folga?","phonetic":"Kud ai téik sândei óf?"},
  {"en":"I''m not feeling well today.","pt":"Não estou me sentindo bem hoje.","phonetic":"Áim nátch fíling uêl tudei"},
  {"en":"When is payday?","pt":"Quando é o dia de pagamento?","phonetic":"Uén iz péi-dei?"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Excuse me, do you have a minute?","pt":"Com licença, tem um minuto?"},
  {"speaker":"Supervisor","en":"Sure, what''s up?","pt":"Claro, o que foi?"},
  {"speaker":"Você","en":"I have a question about my paycheck. My hours don''t match what I worked last week.","pt":"Tenho uma dúvida sobre meu contracheque. As horas não batem com o que trabalhei semana passada."},
  {"speaker":"Supervisor","en":"Let me check. Bring me your timesheet.","pt":"Deixa eu ver. Traga sua folha de horas."},
  {"speaker":"Você","en":"OK, I''ll get it right now. Thank you for looking into it.","pt":"Ok, vou pegar agora. Obrigado por verificar."}
 ]'::jsonb,
 'Para tópicos sensíveis (dinheiro, folga, reclamação), comece SEMPRE com "Do you have a minute?" ou "Could I ask you something?". Quebra o gelo.',
 '"Don''t" americano vira "dôuntch" — bem fechado, quase um T no fim. Pratique: "My hours don''t match" = "Mai áuârs DÔUNTCH métch".',
 '[
  {"wrong":"My salary is wrong","right":"My hours don''t match / There''s an error on my paycheck","explanation_pt":"\"Wrong\" soa acusatório. Apresente o PROBLEMA, não a culpa: \"as horas não batem\"."},
  {"wrong":"I want day off","right":"Could I take a day off? / Could I take Sunday off?","explanation_pt":"Direto demais. Use \"could\" + dia específico. Empregador planeja melhor."}
 ]'::jsonb,
 'Nos EUA, "paystub" é o contracheque detalhado (horas, salário bruto, descontos). Você TEM DIREITO de receber e conferir todo pagamento. Sempre confira.',
 '[
  {"q":"Forma educada de pedir folga:","options":["I no work Sunday","Could I take Sunday off?","Sunday no work","I free Sunday"],"correct":1},
  {"q":"\"My hours don''t match\" significa:","options":["Não tenho horário","Minhas horas não batem","Não trabalho","Trabalho muito"],"correct":1},
  {"q":"\"When is payday?\" é:","options":["Quando trabalho?","Quando é pagamento?","Quando saio?","Quando volto?"],"correct":1}
 ]'::jsonb,
 4, false, 13
)
) AS x(slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes);

-- ===== INTERMEDIÁRIO • Vida Diária =====
WITH m AS (SELECT id FROM public.english_modules WHERE slug='vida-diaria')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes)
SELECT m.id, x.* FROM m, (VALUES
(
 'moradia-convivencia', 'Moradia e convivência', 'Housing & roommates',
 'Você vai se virar na casa compartilhada: lavanderia, cozinha, Wi-Fi, conflitos.',
 'Conviver em trailer com 6 colegas exige inglês básico de convivência.',
 '[
  {"en":"Where is the laundry room?","pt":"Onde fica a lavanderia?","phonetic":"Uér iz dâ lândri rum?"},
  {"en":"Can I use the kitchen now?","pt":"Posso usar a cozinha agora?","phonetic":"Kén ai iúz dâ kítchen náu?"},
  {"en":"What''s the Wi-Fi password?","pt":"Qual a senha do Wi-Fi?","phonetic":"Uátz dâ uáifái pásuôrd?"},
  {"en":"Could you keep it down, please?","pt":"Pode abaixar o barulho, por favor?","phonetic":"Kud iu kíp it dáun, plíz?"},
  {"en":"It''s my turn to clean.","pt":"É minha vez de limpar.","phonetic":"Itz mai tern tu klín"},
  {"en":"Can I borrow your charger?","pt":"Posso pegar seu carregador emprestado?","phonetic":"Kén ai bórrou iór tchár-djer?"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Hey John, what''s the Wi-Fi password?","pt":"Ei John, qual a senha do Wi-Fi?"},
  {"speaker":"Colega","en":"It''s ''farmlife2026'', all lowercase.","pt":"É \"farmlife2026\", tudo minúsculo."},
  {"speaker":"Você","en":"Thanks. Hey, can I borrow your charger? Mine broke.","pt":"Valeu. Ô, posso pegar teu carregador? O meu quebrou."},
  {"speaker":"Colega","en":"Sure, no problem. It''s on the table.","pt":"Claro, sem problema. Tá na mesa."},
  {"speaker":"Você","en":"Awesome, I''ll bring it back tonight.","pt":"Show, devolvo hoje à noite."}
 ]'::jsonb,
 '"Could you keep it down?" é forma educada de "pode abaixar o som?". MUITO mais polido que "stop the noise". Use sempre "could" para pedidos sensíveis.',
 'No inglês americano "borrow" (pegar emprestado) e "lend" (emprestar) NÃO se misturam. EU borrow de VOCÊ. VOCÊ lend pra MIM. Não troque.',
 '[
  {"wrong":"Can you borrow me your charger?","right":"Can I borrow your charger? / Can you lend me your charger?","explanation_pt":"\"Borrow\" sou EU que faço (pego). \"Lend\" é VOCÊ que faz (empresta). Erro clássico de brasileiro."},
  {"wrong":"It''s my time to clean","right":"It''s my turn to clean","explanation_pt":"\"Vez\" no sentido de turno = \"turn\". \"Time\" é tempo cronológico."}
 ]'::jsonb,
 'Em casa compartilhada nos EUA, a regra cultural é: limpe o que você sujou IMEDIATAMENTE. Não esperar acumular. Convivência depende disso.',
 '[
  {"q":"\"Can I borrow your charger?\" é:","options":["Posso te emprestar meu carregador?","Posso pegar seu carregador emprestado?","Posso comprar seu carregador?","Quer meu carregador?"],"correct":1},
  {"q":"Forma educada para barulho:","options":["Shut up","Could you keep it down, please?","Stop noise","Be quiet now"],"correct":1},
  {"q":"\"It''s my turn\" é:","options":["É minha hora","É minha vez","É meu tempo","É meu giro"],"correct":1}
 ]'::jsonb,
 1, true, 12
),
(
 'banco-remessa', 'Banco, mercado e remessa', 'Bank, grocery & money transfer',
 'Você vai abrir conta, fazer compra de mês e mandar dinheiro pro Brasil — em inglês.',
 'Quanto melhor seu inglês nessas operações, menos taxas você paga.',
 '[
  {"en":"I''d like to open a bank account.","pt":"Eu gostaria de abrir uma conta no banco.","phonetic":"Áid láik tu ôupen a bénki akáunt"},
  {"en":"I want to send money to Brazil.","pt":"Quero mandar dinheiro para o Brasil.","phonetic":"Ai uánt tu sénd móni tu Brâzíu"},
  {"en":"What''s the exchange rate today?","pt":"Qual a taxa de câmbio hoje?","phonetic":"Uátz dâ ekstchéindj reit tudei?"},
  {"en":"How much is the fee?","pt":"Quanto é a taxa?","phonetic":"Ráu mâtch iz dâ fí?"},
  {"en":"Paper or plastic?","pt":"Sacola de papel ou plástico?","phonetic":"Péiper ór plástik?"},
  {"en":"Do you have a loyalty card?","pt":"Tem cartão de fidelidade?","phonetic":"Du iu rév a lóialt kárd?"}
 ]'::jsonb,
 '[
  {"speaker":"Atendente Western Union","en":"How can I help you today?","pt":"Como posso ajudar hoje?"},
  {"speaker":"Você","en":"Hi. I''d like to send $500 to Brazil, please.","pt":"Oi. Queria mandar 500 dólares pro Brasil."},
  {"speaker":"Atendente","en":"Sure. To a bank account or for pickup?","pt":"Claro. Pra conta bancária ou pra retirar?"},
  {"speaker":"Você","en":"Bank account. Here''s the info. What''s the exchange rate today, and how much is the fee?","pt":"Conta. Aqui as informações. Qual o câmbio hoje, e quanto é a taxa?"},
  {"speaker":"Atendente","en":"The rate is 5.10 and the fee is $8. Total $508.","pt":"Câmbio 5,10, taxa 8 dólares. Total 508."},
  {"speaker":"Você","en":"Sounds good. Let''s do it.","pt":"Show. Pode fazer."}
 ]'::jsonb,
 '"I''d like to..." é o jeito profissional de pedir QUALQUER serviço (banco, restaurante, hotel, loja). Decore essa estrutura — vai usar todo dia.',
 'A palavra "exchange" tem som de "tch" no meio: "iks-TCHÉINDJ". Não "iksêinje". Pratique.',
 '[
  {"wrong":"I want make exchange","right":"I''d like to exchange money / What''s the exchange rate?","explanation_pt":"\"Make exchange\" não existe. \"Exchange\" é o verbo: \"to exchange money\"."},
  {"wrong":"How much fee?","right":"How much is the fee? / What''s the fee?","explanation_pt":"Precisa do verbo \"is\" ou \"what''s\"."}
 ]'::jsonb,
 'No supermercado, te perguntam "Paper or plastic?" (sacola de papel ou plástico?). Não é pegadinha. Em alguns estados, sacola é paga — leve a sua de pano.',
 '[
  {"q":"\"What''s the exchange rate?\" é:","options":["Qual o câmbio?","Qual o trocado?","Qual a hora?","Onde troca?"],"correct":0},
  {"q":"\"I''d like to send money to Brazil\" significa:","options":["Tenho dinheiro do Brasil","Quero enviar dinheiro pro Brasil","Brasil mandou dinheiro","Não tenho dinheiro"],"correct":1},
  {"q":"\"Paper or plastic?\" no mercado é:","options":["Cheque ou cartão?","Sacola de papel ou plástico?","Comer aqui ou viagem?","Frio ou quente?"],"correct":1}
 ]'::jsonb,
 2, false, 13
)
) AS x(slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes);

-- ===== AVANÇADO • Direitos e Negociação =====
WITH m AS (SELECT id FROM public.english_modules WHERE slug='direitos-negociacao')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes)
SELECT m.id, x.* FROM m, (VALUES
(
 'direitos-denuncia', 'Conhecer direitos e denunciar abuso', 'Knowing your rights & reporting abuse',
 'Você vai falar com firmeza sobre seus direitos e saber como/onde denunciar abuso — em inglês.',
 'Lei H-2A te protege MUITO. Empregador desonesto conta com sua falta de inglês. Vamos virar esse jogo.',
 '[
  {"en":"I have rights as an H-2A worker.","pt":"Eu tenho direitos como trabalhador H-2A.","phonetic":"Ai rév ráits éz en éitch-tu-éi uêrker"},
  {"en":"This is illegal under the H-2A program.","pt":"Isso é ilegal segundo o programa H-2A.","phonetic":"Dis iz iligôl ânder dâ éitch-tu-éi prôgrem"},
  {"en":"I''d like to see my contract again.","pt":"Eu gostaria de ver meu contrato de novo.","phonetic":"Áid láik tu sí mai kóntrekt aguên"},
  {"en":"You can''t take my passport.","pt":"O senhor não pode ficar com meu passaporte.","phonetic":"Iu kéntch téik mai pásport"},
  {"en":"I''ll report this to the Department of Labor.","pt":"Vou reportar isso ao Departamento do Trabalho.","phonetic":"Áil rrepórt dis tu dâ deparmen óv léibor"},
  {"en":"I need to call CDM (Centro de los Derechos del Migrante).","pt":"Preciso ligar para o CDM (Centro dos Direitos do Migrante).","phonetic":"Ai níd tu kól si-di-em"}
 ]'::jsonb,
 '[
  {"speaker":"Empregador","en":"Give me your passport. I''ll keep it safe.","pt":"Me dá seu passaporte. Vou guardar."},
  {"speaker":"Você","en":"With respect, sir, I can''t do that. You''re not allowed to take my passport.","pt":"Com respeito, senhor, não posso. O senhor não tem permissão de ficar com meu passaporte."},
  {"speaker":"Empregador","en":"It''s for your safety.","pt":"É pra sua segurança."},
  {"speaker":"Você","en":"I understand, but under the H-2A program, only I can hold my passport. I''ll keep it safe myself.","pt":"Entendo, mas pelo programa H-2A, só eu posso ficar com meu passaporte. Eu mesmo cuido."},
  {"speaker":"Empregador","en":"Fine.","pt":"Tá bem."},
  {"speaker":"Você","en":"Thank you for understanding.","pt":"Obrigado por entender."}
 ]'::jsonb,
 'Para discordar com respeito, use "I understand, but..." ou "With respect, sir, ...". Mostra que você OUVIU mas tem posição própria.',
 'Pratique a palavra "illegal" (ilíg(ô)l) — som de "i" fechado no começo, NÃO "ê-legal". E "rights" (ráits) — ditongo bem marcado.',
 '[
  {"wrong":"You can''t do this with me","right":"You''re not allowed to do this / This is illegal","explanation_pt":"\"Não pode\" no sentido de \"é proibido\" vira \"not allowed\". \"Can''t\" pode confundir."},
  {"wrong":"I will denounce you","right":"I''ll report this to the Department of Labor","explanation_pt":"\"Denounce\" soa pesado/inquisitório em inglês. \"Report\" é o termo correto pra denúncia trabalhista."}
 ]'::jsonb,
 'CDM (Centro de los Derechos del Migrante) ATENDE EM PORTUGUÊS. Telefone gratuito: 1-855-234-9699. Ligue se precisar de ajuda — anônimo, gratuito, sem risco.',
 '[
  {"q":"\"You can''t take my passport\" significa:","options":["Você não pode pegar meu passaporte","Não trouxe passaporte","Quer meu passaporte","Esqueci passaporte"],"correct":0},
  {"q":"Forma educada de discordar:","options":["No way!","With respect, sir, I can''t do that","You wrong!","Stop!"],"correct":1},
  {"q":"Termo correto para \"denúncia trabalhista\":","options":["Denounce","Report","Tell on","Complain"],"correct":1}
 ]'::jsonb,
 1, true, 16
),
(
 'negociar-renovacao', 'Negociar aumento e renovação', 'Negotiating raises & renewal',
 'Você vai pedir aumento, renovação de contrato ou recomendação para próximo ano — sem soar pedinte.',
 'Empregador quer reter trabalhador bom. Saber NEGOCIAR é o que separa quem volta de quem não volta.',
 '[
  {"en":"I''d like to talk about my pay.","pt":"Gostaria de conversar sobre meu pagamento.","phonetic":"Áid láik tu tók abáut mai péi"},
  {"en":"I''ve been with you for two seasons now.","pt":"Já estou com vocês há duas safras.","phonetic":"Áiv bin uith iu fôr tu sízons náu"},
  {"en":"My productivity has gone up consistently.","pt":"Minha produtividade cresceu de forma consistente.","phonetic":"Mai prodaktívit ráz góun âp konsistently"},
  {"en":"Would you consider a raise to $X per hour?","pt":"O senhor consideraria um aumento para $X por hora?","phonetic":"Wúd iu konsider a réiz tu X per áuâr?"},
  {"en":"I''d love to come back next year.","pt":"Eu adoraria voltar no ano que vem.","phonetic":"Áid lâv tu kâm béki nékst ier"},
  {"en":"Would you write a recommendation letter for me?","pt":"O senhor escreveria uma carta de recomendação pra mim?","phonetic":"Wúd iu ráit a rekomendéishon léter fôr mi?"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Sir, do you have a few minutes? I''d like to talk about something important.","pt":"Senhor, tem alguns minutos? Queria conversar sobre algo importante."},
  {"speaker":"Empregador","en":"Sure, what is it?","pt":"Claro, o que é?"},
  {"speaker":"Você","en":"I''ve been with you for two seasons. My productivity has gone up, and I''ve trained two new workers this year.","pt":"Estou com vocês há duas safras. Minha produtividade cresceu e treinei dois novatos esse ano."},
  {"speaker":"Você","en":"Would you consider a raise to seventeen dollars an hour for next season?","pt":"O senhor consideraria aumentar pra 17 dólares por hora ano que vem?"},
  {"speaker":"Empregador","en":"You''ve been a great worker. Let me think about it and I''ll get back to you.","pt":"Você é um ótimo trabalhador. Deixa eu pensar e te respondo."},
  {"speaker":"Você","en":"Thank you. I really appreciate the consideration.","pt":"Obrigado. Agradeço de coração a consideração."}
 ]'::jsonb,
 'Present perfect continuous ("I''ve BEEN with you", "I''ve BEEN working") mostra DURAÇÃO + RELEVÂNCIA até agora. Perfeito pra negociação: mostra investimento de tempo.',
 '"Would" americano vira "wúd" curto. "Would you consider" = "WÚD-iu konsíder", tudo grudado. Não "uáu-uld".',
 '[
  {"wrong":"I want more money","right":"I''d like to talk about my pay / Would you consider a raise?","explanation_pt":"\"Want more money\" soa pedinte. Apresente CONTEXTO (anos, performance) e use \"would you consider\"."},
  {"wrong":"Give me raise","right":"Would you consider a raise to $X?","explanation_pt":"Imperativo (\"give me\") em negociação é desastre. Sempre \"would you consider\"."}
 ]'::jsonb,
 'Trabalhador H-2A que VOLTA por 3+ anos com mesmo empregador costuma ganhar prioridade, melhor pagamento e às vezes ajuda na trilha pro Green Card (EB-3). Cultive a relação.',
 '[
  {"q":"\"I''ve been with you for two seasons\" significa:","options":["Vou ficar duas safras","Estou com vocês há duas safras","Trabalho duas vezes","Só duas safras"],"correct":1},
  {"q":"Forma profissional de pedir aumento:","options":["Give me more money","Would you consider a raise to $X?","I want more salary","Pay me more"],"correct":1},
  {"q":"\"Carta de recomendação\":","options":["Recommend letter","Recommendation letter","Suggestion paper","Reference card"],"correct":1}
 ]'::jsonb,
 2, false, 16
)
) AS x(slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes);

-- ===== AVANÇADO • Inglês Americano Real =====
WITH m AS (SELECT id FROM public.english_modules WHERE slug='ingles-real')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes)
SELECT m.id, x.* FROM m, (VALUES
(
 'connected-speech', 'Connected speech: gonna, wanna, gotta', 'Connected speech: gonna, wanna, gotta',
 'Você vai ENTENDER e USAR as contrações que americano fala todo segundo: gonna, wanna, gotta, lemme, gimme.',
 'Se você NÃO entende "wanna", "gonna", você não entende inglês falado real. Vamos resolver agora.',
 '[
  {"en":"I''m gonna grab lunch. (going to)","pt":"Eu vou pegar o almoço.","phonetic":"Áim GÔ-nâ grébi lântch"},
  {"en":"Do you wanna come? (want to)","pt":"Você quer vir?","phonetic":"Du iu UÁ-nâ kâm?"},
  {"en":"I gotta finish this row. (got to / have to)","pt":"Tenho que terminar esta fileira.","phonetic":"Ai GÁ-rrâ fínish dis rôu"},
  {"en":"Lemme see that. (let me)","pt":"Deixa eu ver isso.","phonetic":"LÉ-mi sí dét"},
  {"en":"Gimme a sec. (give me a second)","pt":"Me dá um segundo.","phonetic":"GUÍ-mi a sék"},
  {"en":"Whaddya mean? (what do you)","pt":"O que você quer dizer?","phonetic":"UÁ-dia mín?"}
 ]'::jsonb,
 '[
  {"speaker":"Colega","en":"Hey, I''m gonna grab lunch. Wanna come?","pt":"Ô, vou pegar o almoço. Quer vir?"},
  {"speaker":"Você","en":"Yeah, lemme finish this row first. Gimme five minutes.","pt":"Quero, deixa eu terminar essa fileira. Me dá 5 minutos."},
  {"speaker":"Colega","en":"OK, but we gotta hurry. Break''s almost over.","pt":"Tá, mas temos que correr. A pausa quase acabou."},
  {"speaker":"Você","en":"Got it. Where ya wanna go?","pt":"Entendi. Aonde quer ir?"},
  {"speaker":"Colega","en":"There''s a taco truck down the road.","pt":"Tem um food truck de taco logo ali."},
  {"speaker":"Você","en":"Sounds good. Let''s do it.","pt":"Show. Bora."}
 ]'::jsonb,
 'Essas contrações são INFORMAIS — perfeitas pra falar com colegas, mas NÃO use em entrevista ou com oficial. Escrever "gonna" em email profissional pega mal.',
 'A chave do "gonna" é o "n-n-n" alongado: GÔ-NNÂ. Não "gô-na" rápido. E o "T" de "gotta" vira "R" (sotaque americano): GÁ-RRÂ.',
 '[
  {"wrong":"I am going to to grab lunch (sobreestendido)","right":"I''m gonna grab lunch","explanation_pt":"Falar pausado e completo soa robótico. Aprenda a CONTRAIR como americano contrai."},
  {"wrong":"What do you mean? (na fala casual)","right":"Whaddya mean?","explanation_pt":"Na conversa entre colegas, ninguém fala separado. \"Whaddya\" é o normal."}
 ]'::jsonb,
 'Pratique escutar canais como CNN, podcasts (ESL Podcast), filmes sem legenda. SEU OUVIDO PRECISA SE ACOSTUMAR. Sem isso, todo americano vai parecer "falando rápido demais".',
 '[
  {"q":"\"Gonna\" é contração de:","options":["Got to","Going to","Want to","Give to"],"correct":1},
  {"q":"\"Lemme see that\" significa:","options":["Veja isso","Deixa eu ver","Me dá isso","Eu vejo"],"correct":1},
  {"q":"\"Gotta\" pode significar:","options":["Pegar","Ter que / preciso","Querer","Conseguir"],"correct":1}
 ]'::jsonb,
 1, true, 14
),
(
 'phrasal-verbs', 'Phrasal verbs do trabalho', 'Workplace phrasal verbs',
 'Você vai entender e usar os 12 phrasal verbs mais ouvidos numa fazenda americana.',
 'Phrasal verb é o COMBO verbo+preposição com significado novo. "Pick up" não é "pegar pra cima", é só "pegar".',
 '[
  {"en":"Pick up the trash. (pegar)","pt":"Pegue o lixo.","phonetic":"Pík âp dâ trésh"},
  {"en":"Show up on time. (aparecer/comparecer)","pt":"Apareça no horário.","phonetic":"Shôu âp ón táim"},
  {"en":"Put on your gloves. (vestir)","pt":"Coloque suas luvas.","phonetic":"Pút ón iór glâvs"},
  {"en":"Take off your boots. (tirar)","pt":"Tire suas botas.","phonetic":"Téik óf iór butz"},
  {"en":"Fill out this form. (preencher)","pt":"Preencha este formulário.","phonetic":"Fíl áut dis fórm"},
  {"en":"Look out! (cuidado!)","pt":"Cuidado!","phonetic":"Lúk áut!"},
  {"en":"Slow down a little. (ir mais devagar)","pt":"Vá um pouco mais devagar.","phonetic":"Slôu dáun a líro"},
  {"en":"Speak up, please. (falar mais alto)","pt":"Fale mais alto, por favor.","phonetic":"Spík âp, plíz"},
  {"en":"Hang on a second. (espera um pouco)","pt":"Espera um pouco.","phonetic":"Réng ón a sékon"}
 ]'::jsonb,
 '[
  {"speaker":"Supervisor","en":"Hey, pick up those crates and put them in the truck.","pt":"Ô, pega essas caixas e coloca no caminhão."},
  {"speaker":"Você","en":"Got it. Should I take off my gloves first?","pt":"Entendi. Devo tirar as luvas primeiro?"},
  {"speaker":"Supervisor","en":"No, keep them on. Hang on, let me show you.","pt":"Não, mantém. Espera, deixa eu te mostrar."},
  {"speaker":"Você","en":"Sorry, could you speak up? It''s noisy here.","pt":"Desculpa, pode falar mais alto? Tá barulhento aqui."},
  {"speaker":"Supervisor","en":"Sure. Like this — stack them by size.","pt":"Claro. Assim ó — empilha por tamanho."},
  {"speaker":"Você","en":"Got it, thanks. I''ll fill out the log when I''m done.","pt":"Beleza. Preencho o registro quando terminar."}
 ]'::jsonb,
 'Phrasal verbs SEPARÁVEIS: você pode dizer "pick UP the trash" OU "pick the trash UP". Com pronome (it, them), É OBRIGATÓRIO separar: "pick IT up" (NÃO "pick up it").',
 'A partícula do phrasal verb costuma ser TÔNICA: "pick UP", "show UP", "take OFF". Sotaque cai na preposição.',
 '[
  {"wrong":"Take out your boots","right":"Take off your boots","explanation_pt":"\"Take out\" = tirar de DENTRO (lixo, dente). \"Take off\" = tirar do corpo (roupa, sapato)."},
  {"wrong":"Pick up it","right":"Pick it up","explanation_pt":"Com pronome (it, them, me, him), o phrasal verb DEVE separar."}
 ]'::jsonb,
 'Phrasal verbs são a parte mais FRUSTRANTE do inglês — não tem regra, é decoreba contextual. Mas é também o que diferencia inglês intermediário do avançado.',
 '[
  {"q":"\"Pick it up\" — por que não \"pick up it\"?","options":["Erro de gramática","Com pronome, separa sempre","Não importa","É britânico"],"correct":1},
  {"q":"\"Show up on time\" significa:","options":["Apareça no horário","Mostre o tempo","Mostre cedo","Veja a hora"],"correct":0},
  {"q":"Diferença take off / take out:","options":["Mesma coisa","Take off=tirar do corpo, take out=tirar de dentro","Take off=desligar","Take out=sair"],"correct":1}
 ]'::jsonb,
 2, false, 15
),
(
 'small-talk', 'Small talk com americanos', 'Small talk with Americans',
 'Você vai puxar conversa, falar sobre tempo, time de futebol, fim de semana — como gente, não como robô.',
 'Small talk parece besteira, mas é a porta pra você fazer AMIGOS americanos. Quem fala small talk se integra. Quem não fala, fica isolado.',
 '[
  {"en":"How''s it going?","pt":"E aí, como vai?","phonetic":"Ráu zit gôuing?"},
  {"en":"Not too bad, you?","pt":"Vou bem, e você?","phonetic":"Nátch tu béd, iu?"},
  {"en":"Crazy weather today, huh?","pt":"Tempo doido hoje, né?","phonetic":"Kréizi uéder tudei, rrâ?"},
  {"en":"How was your weekend?","pt":"Como foi seu fim de semana?","phonetic":"Ráu uáz iór uíkend?"},
  {"en":"Did you catch the game last night?","pt":"Viu o jogo ontem à noite?","phonetic":"Dídiu kétch dâ guêim lést náit?"},
  {"en":"Have a good one!","pt":"Tenha um bom dia!","phonetic":"Rév a gud uán!"}
 ]'::jsonb,
 '[
  {"speaker":"Colega","en":"Hey man, how''s it going?","pt":"E aí cara, como vai?"},
  {"speaker":"Você","en":"Not too bad, you? Crazy heat today, huh?","pt":"Vou indo, e você? Calor doido hoje, né?"},
  {"speaker":"Colega","en":"Tell me about it. Did you catch the game last night?","pt":"Me fala. Viu o jogo ontem?"},
  {"speaker":"Você","en":"Nah, I went to bed early. Who won?","pt":"Nem, fui dormir cedo. Quem ganhou?"},
  {"speaker":"Colega","en":"Lakers. By 10 points.","pt":"Lakers. Por 10 pontos."},
  {"speaker":"Você","en":"Nice. Alright, have a good one!","pt":"Show. Beleza, tenha um bom dia!"}
 ]'::jsonb,
 'Small talk é PROIBIDO dar respostas longas. "How are you?" → "Good, you?". Não conte sua vida. É RITUAL social, não conversa profunda.',
 '"How''s it going" sai colado: "RAUZIT-góuing". O "z" do "is" liga com o "i" do "it". Pratique a frase inteira como UMA palavra.',
 '[
  {"wrong":"How are you? (com voz triste)","right":"How''s it going? + sorriso","explanation_pt":"Em small talk, ENERGIA importa mais que precisão. Sorria mesmo cansado."},
  {"wrong":"I''m so so / More or less","right":"Not too bad / Pretty good / Can''t complain","explanation_pt":"\"Más o menos\" não traduz literal. Use \"not too bad\" — significa o mesmo e é natural."}
 ]'::jsonb,
 'Tópicos seguros pra small talk com americano: TEMPO, esporte, fim de semana, comida. EVITE: política, religião, salário pessoal, problemas. Cultural.',
 '[
  {"q":"\"How''s it going?\" — boa resposta:","options":["I have problems","Not too bad, you?","Goodbye","I work hard"],"correct":1},
  {"q":"\"Tell me about it\" significa:","options":["Me conta a história","Concordo totalmente / Sei como é","Me explique","Fale baixo"],"correct":1},
  {"q":"\"Have a good one!\" é:","options":["Pegue um bom","Tenha um bom dia (despedida)","Boa sorte","Sorria"],"correct":1}
 ]'::jsonb,
 3, false, 13
)
) AS x(slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes);

-- ===== AVANÇADO • Liderança e Retorno =====
WITH m AS (SELECT id FROM public.english_modules WHERE slug='lideranca-retorno')
INSERT INTO public.english_lessons (module_id, slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes)
SELECT m.id, x.* FROM m, (VALUES
(
 'treinar-colegas', 'Treinar colegas novatos', 'Training new workers',
 'Você vai treinar novatos e ser visto como LÍDER pelo empregador — o que vale promoção, melhor pagamento e volta garantida.',
 'Quem ensina outros vira valor PERMANENTE pro empregador. Inglês de liderança é diferente.',
 '[
  {"en":"Let me show you how it''s done.","pt":"Deixa eu te mostrar como se faz.","phonetic":"Lémi shôu iu rráu itz dân"},
  {"en":"Watch closely, then you try.","pt":"Observe com atenção, depois você tenta.","phonetic":"Uátch klôusli, dén iu trái"},
  {"en":"Always wear your gloves — safety first.","pt":"Sempre use luvas — segurança em primeiro lugar.","phonetic":"Ól-uêis uér iór glâvs — séifty fêrst"},
  {"en":"Don''t worry, you''ll get the hang of it.","pt":"Não se preocupe, você vai pegar o jeito.","phonetic":"Dôntch uári, iu uíl guét dâ rréng óvit"},
  {"en":"If you''re not sure, just ask me.","pt":"Se tiver dúvida, é só me perguntar.","phonetic":"If iór nátch shór, djâst ásk mi"},
  {"en":"Good job — keep it up!","pt":"Bom trabalho — continue assim!","phonetic":"Gud djób — kíp it âp!"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Hey Marcelo, welcome. Let me show you how we pick these grapes.","pt":"E aí Marcelo, bem-vindo. Deixa eu te mostrar como a gente colhe essas uvas."},
  {"speaker":"Novato","en":"Thanks. I''ve never done this before.","pt":"Valeu. Nunca fiz isso antes."},
  {"speaker":"Você","en":"No worries. Watch closely. You twist the stem like this, gently — don''t squeeze the fruit.","pt":"Tranquilo. Olha com atenção. Torce o cabinho assim, com cuidado — não esmaga a fruta."},
  {"speaker":"Você","en":"Now you try. Take your time.","pt":"Agora você tenta. Sem pressa."},
  {"speaker":"Novato","en":"Like this?","pt":"Assim?"},
  {"speaker":"Você","en":"Almost — twist a little more. Perfect. You''ll get the hang of it.","pt":"Quase — torce um pouquinho mais. Perfeito. Você vai pegar o jeito."}
 ]'::jsonb,
 'Imperativo + advérbio é o estilo de ensino claro: "Watch CLOSELY", "Move SLOWLY", "Press GENTLY". Mostra COMO fazer, não só O QUE fazer.',
 'Pratique "you''ll" (iúl) — contração de "you will". "You''ll get the hang of it" = "iúl GUÉT dâ RRÉNG óvit", tudo grudado.',
 '[
  {"wrong":"Do like me","right":"Do it like this / Watch me do it","explanation_pt":"\"Like me\" pode ser entendido como \"goste de mim\". Use \"like this\" (assim) ou \"watch me\"."},
  {"wrong":"You will learn fast","right":"You''ll get the hang of it / You''ll pick it up quickly","explanation_pt":"\"Pegar o jeito\" tem expressão própria: \"get the hang of it\" — muito mais natural."}
 ]'::jsonb,
 'Empregadores americanos PREMIAM o trabalhador que treina novatos — virou "informal supervisor". Esse cara é o primeiro a ser chamado de volta no próximo ano.',
 '[
  {"q":"\"You''ll get the hang of it\" significa:","options":["Você vai pegar o jeito","Vai pegar o galho","Vai ter sorte","Vai aprender em casa"],"correct":0},
  {"q":"\"Watch closely\" significa:","options":["Veja de perto","Observe com atenção","Olhe pelo relógio","Veja amanhã"],"correct":1},
  {"q":"\"Keep it up!\" no contexto de elogio:","options":["Mantenha levantado","Continue assim!","Suba mais","Pare aí"],"correct":1}
 ]'::jsonb,
 1, true, 14
),
(
 'renovar-voltar', 'Renovar visto e voltar ano que vem', 'Visa renewal & returning next year',
 'Você vai pedir formalmente sua renovação, garantir job offer pro próximo ano e até abrir caminho pro Green Card EB-3.',
 'O OURO do H-2A não é uma safra — é VOLTAR todo ano. Quem fala bem inglês negocia isso melhor.',
 '[
  {"en":"I''d love to return next season.","pt":"Eu adoraria voltar na próxima safra.","phonetic":"Áid lâv tu rritêrn nékst sízon"},
  {"en":"Can we start the renewal process?","pt":"Podemos começar o processo de renovação?","phonetic":"Kén ui start dâ rrenúal próses?"},
  {"en":"Would you sponsor my visa again?","pt":"O senhor patrocinaria meu visto de novo?","phonetic":"Wúd iu spónser mai víza aguên?"},
  {"en":"I''ve been thinking about the EB-3 process. Would you consider sponsoring me?","pt":"Estou pensando no processo EB-3. O senhor consideraria me patrocinar?","phonetic":"Áiv bin thinking abáut di-bi-thri próses. Wúd iu konsíder spónsering mi?"},
  {"en":"What can I do to be on top of the list next year?","pt":"O que posso fazer pra estar no topo da lista ano que vem?","phonetic":"Uát kén ai du tu bi ón tóp óv dâ list nékst ier?"},
  {"en":"Thank you for the opportunity this season.","pt":"Obrigado pela oportunidade nessa safra.","phonetic":"Théngkiu fôr di opôrtchunit dis sízon"}
 ]'::jsonb,
 '[
  {"speaker":"Você","en":"Sir, before I leave, I wanted to talk about next year.","pt":"Senhor, antes de eu ir, queria falar sobre o ano que vem."},
  {"speaker":"Empregador","en":"Sure, go ahead.","pt":"Claro, fala."},
  {"speaker":"Você","en":"I''d love to return next season. Would you sponsor my visa again?","pt":"Adoraria voltar. O senhor patrocinaria meu visto de novo?"},
  {"speaker":"Empregador","en":"Absolutely. You''ve been one of our best workers. Consider it done.","pt":"Com certeza. Foi um dos nossos melhores. Pode considerar feito."},
  {"speaker":"Você","en":"Thank you so much. I''ve also been thinking about the EB-3 process. Is that something you''d ever consider?","pt":"Muito obrigado. Também tenho pensado no processo EB-3. Isso é algo que o senhor consideraria um dia?"},
  {"speaker":"Empregador","en":"It''s a long process, but yes — let''s talk more about that next year.","pt":"É um processo longo, mas sim — vamos conversar mais ano que vem."}
 ]'::jsonb,
 'Para tópicos delicados (Green Card, renovação), use perguntas SUAVES: "Would you consider...?", "Is that something you''d ever...?". Abre porta sem pressão.',
 'EB-3 lê-se "i-bi-thri" em inglês. Não "ê-bê-trêis". Sempre soletre em inglês quando falar de programas de visto.',
 '[
  {"wrong":"I want come back","right":"I''d love to return / I''d like to come back","explanation_pt":"\"I want\" é cru. \"I''d love\" é caloroso, agradável de ouvir."},
  {"wrong":"Pay for my Green Card","right":"Would you sponsor me for the EB-3?","explanation_pt":"Patrocínio não é \"pagar\" — é \"sponsor\". E EB-3 é a categoria específica pra trabalhador rural."}
 ]'::jsonb,
 'Green Card EB-3 (Unskilled Workers) pode levar 5-10 anos, mas é UMA DAS rotas legais pra residência. Algumas fazendas grandes patrocinam trabalhadores antigos. Pergunte com calma, sem pressão.',
 '[
  {"q":"\"I''d love to return next season\" é:","options":["Quero voltar agora","Adoraria voltar na próxima safra","Vou voltar amanhã","Já voltei"],"correct":1},
  {"q":"\"Would you sponsor my visa?\" significa:","options":["Você pagaria meu visto?","Você patrocinaria meu visto?","Você daria meu visto?","Você empresta visto?"],"correct":1},
  {"q":"Forma de abrir conversa sobre Green Card:","options":["Give me Green Card","Would you consider sponsoring me for the EB-3?","I want Green Card now","Green Card please"],"correct":1}
 ]'::jsonb,
 2, false, 16
)
) AS x(slug, title_pt, title_en, goal_pt, intro_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, sort_order, is_free, estimated_minutes);
