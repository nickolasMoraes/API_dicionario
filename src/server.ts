import express, { Request, Response } from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import cors from 'cors';
import * as admin from 'firebase-admin';
import puppeteer from 'puppeteer';

const app = express();
const port = process.env.PORT || 3000;

const firebaseConfig = {
  apiKey: "AIzaSyDuKi7TJTFB3rnnqLZMJEJTm_epX9-nuco",
  authDomain: "dicioacademy-a75ff.firebaseapp.com",
  projectId: "dicioacademy-a75ff",
  storageBucket: "dicioacademy-a75ff.appspot.com",
  messagingSenderId: "655981910595",
  appId: "1:655981910595:web:5455aa22be14bd183452f6"
};
const serviceAccount = require('./dicioacademy-a75ff-firebase-adminsdk-l6on3-79a4065525.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://seu-projeto-firebase.firebaseio.com',
});

app.use(cors());

// Rota para realizar a busca da palavra
app.get('/search/:word', async (req: Request, res: Response) => {
  const word = req.params.word;
  const encodedWord = encodeURIComponent(word);  // Codifica a palavra para a URL
  try {
    const result = await scrapeDicio(word);

    await saveRecentSearch(encodedWord);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao obter informações da palavra.' });
  }
});

// Rota para obter as últimas pesquisas
app.get('/recent-searches', async (req: Request, res: Response) => {
  try {
    // Obtenha as últimas pesquisas do Firebase
    const recentSearches = await getRecentSearches();
    res.json({ recentSearches });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao obter as últimas palavras pesquisadas.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

// Função para salvar uma pesquisa recente no Firebase
async function saveRecentSearch(word: string) {
  const db = admin.firestore();
  const searchesRef = db.collection('searches');

  // Adicione a palavra à coleção de pesquisas
  await searchesRef.add({
    word,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Função para obter as últimas pesquisas do Firebase sem repetições
async function getRecentSearches(): Promise<string[]> {
  const db = admin.firestore();
  const searchesRef = db.collection('searches');

  // Obtenha as últimas pesquisas do Firebase
  const snapshot = await searchesRef.orderBy('timestamp', 'desc').limit(10).get();
  const uniqueSearches = new Set<string>();

  snapshot.docs.forEach((doc) => {
    const word = doc.data().word;
    uniqueSearches.add(word);
  });

  // Converta o conjunto para um array
  const searches = Array.from(uniqueSearches);

  return searches;
}

// Função para realizar o web scraping no site dicio
async function scrapeDicio(word: string): Promise<{ word: string; meaning?: string; additionalInfo?: string; phrases?: string; antonyms?: string[]; hrefContent?: string  }> {
  const encodedWord = encodeURIComponent(word);  // Codifica a palavra para a URL
  let url: string;

  // Verifica se a palavra tem "c" ou "ç" no meio
  if (/c|ç/.test(word.slice(1, -1))) {
    url = `https://www.dicio.com.br/pesquisa.php?q=${encodedWord}`;
  } else {
    url = `https://www.dicio.com.br/${encodedWord}`;
  }

  const response = await axios.get(url);

  if (response.status === 200) {
    const $ = cheerio.load(response.data);

    let hrefContent: string | undefined;
    let meaning: string | undefined;
    let additionalInfo: string | undefined;
    let phrases: string | undefined;
    let antonyms: string[] | undefined;

    // Verifica se a palavra tem "c" ou "ç" no meio
    if (/c|ç/.test(word.slice(1, -1))) {
      // Obtém o conteúdo do href
      hrefContent = $('a._sugg').first().attr('href') || undefined;

      // Incrementa a URL base
      const fullUrl = `https://www.dicio.com.br${hrefContent}`;
      
      // Realiza scraping na URL completa para obter as informações padrão
      const scrapeResult = await scrapeStandardInfo(fullUrl, word);
      
      // Atualiza os campos com base nos resultados do scraping
      meaning = scrapeResult.meaning;
      additionalInfo = scrapeResult.additionalInfo;
      phrases = scrapeResult.phrases;
      antonyms = scrapeResult.antonyms;
    } else {
      // Obtém o significado da palavra
      meaning = $('p.significado.textonovo').first().text().trim();

      // Obtém informações adicionais, frases e antônimos
      additionalInfo = $('p.adicional:not(.sinonimo)').text().trim();
      phrases = $('div.frase').text().trim();
      try {
        antonyms = await scrapeAntonimos(word);
      } catch (error) {
        console.error((error as Error).message);
      }
    }

    return { word, meaning, additionalInfo, phrases, antonyms, hrefContent  };
  } else {
    throw new Error('Erro ao obter a página.');
  }
}

// Função para realizar scraping na URL completa para obter as informações padrão
async function scrapeStandardInfo(url: string, word: string): Promise<{ meaning?: string; additionalInfo?: string; phrases?: string; antonyms?: string[] }> {
  const response = await axios.get(url);

  if (response.status === 200) {
    const $ = cheerio.load(response.data);

    const meaning = $('p.significado.textonovo').first().text().trim();
    const additionalInfo = $('p.adicional:not(.sinonimo)').text().trim();
    const phrases = $('div.frase').text().trim();
    let antonyms: string[] | undefined;
    try {
      antonyms = await scrapeAntonimos(word);
    } catch (error) {
      console.error((error as Error).message);
    }

    return { meaning, additionalInfo, phrases, antonyms };
  } else {
    throw new Error('Erro ao obter a página.');
  }
}

// Função para obter os antônimos do site
async function scrapeAntonimos(word: string): Promise<string[]> {
  const antonimosUrl = `https://www.antonimos.com.br/${word}`;
  const antonimosResponse = await axios.get(antonimosUrl);

  if (antonimosResponse.status === 200) {
    const $ = cheerio.load(antonimosResponse.data);

    // Puxa os antônimos do site
    const antonyms = $('p.ant-list').first().text().trim().split(', ');

    return antonyms;
  } else {
    throw new Error('Erro ao obter os antônimos.');
  }
}

// Função para realizar o scraping do conteúdo da tag div#dia
async function scrapeWordOfTheDay(): Promise<string> {
  const url = 'https://www.dicio.com.br/';
  const response = await axios.get(url);

  if (response.status === 200) {
    const $ = cheerio.load(response.data);
    const wordOfTheDay = $('div.word-of-day--widget').text().trim();
    return wordOfTheDay;
  } else {
    throw new Error('Erro ao obter a página do Dicio.');
  }
}

// Rota para obter a palavra do dia
app.get('/dia', async (req: Request, res: Response) => {
  try {
    const wordOfTheDay = await scrapeWordOfTheDay();
    res.send(wordOfTheDay);
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao obter a palavra do dia.');
  }
});

// Função para realizar o scraping do conteúdo da tag div#word
async function scrapeVocabular(): Promise<string> {
  const url = 'https://www.dicio.com.br/';
  const response = await axios.get(url);

  if (response.status === 200) {
    const $ = cheerio.load(response.data);
    const vocabular = $('div.word').text().trim();
    return vocabular;
  } else {
    throw new Error('Erro ao obter a página do Dicio.');
  }
}

// Rota para obter a palavra do vocabularioo
app.get('/vocabulario', async (req: Request, res: Response) => {
  try {
    const vocabular = await scrapeVocabular();
    res.send(vocabular);
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao obter a palavra do dia.');
  }
});

const browserPromise = puppeteer.launch({ headless: true });

app.get('/sortear', async (req: Request, res: Response) => {
  try {
    // Aguarda o navegador estar pronto
    const browser = await browserPromise;
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if(['image', 'stylesheet', 'font', 'media', 'other'].includes(req.resourceType())){
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navega até a página
    await page.goto('https://dicio.com.br/');

    await page.waitForSelector('div.btn-cta');
    await page.click('div.btn-cta');

    // Aguarda até que o conteúdo seja carregado
    await page.evaluate(() => {
      return new Promise(resolve => {
        setTimeout(resolve, 2000);
      });
    });

    const content = await page.evaluate(() => {
      const div = document.querySelector('#js-pl-aleatoria');
      return div ? div.textContent : null;
    });

    // Retorna o texto da palavra aleatória como resposta
    res.send(content);
  } catch (error) {
    // Em caso de erro, retorna uma mensagem de erro
    console.error('Ocorreu um erro:', error);
    res.status(500).send('Ocorreu um erro ao processar a solicitação.');
  }
});
