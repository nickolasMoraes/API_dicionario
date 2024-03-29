import express, { Request, Response } from 'express';
import axios from 'axios';
import cheerio, { CheerioAPI } from 'cheerio';
import cors from 'cors';  // Importe a biblioteca cors

const app = express();
const port = 3000;

// Adicione a middleware cors ao seu aplicativo Express
app.use(cors());

app.get('/search/:word', async (req: Request, res: Response) => {
  const word = req.params.word;
  try {
    const meaning = await getMeaning(word);
    res.json({ word, meaning });
  } catch (error) {
    console.error(error);  // Logue o erro no console
    res.status(500).json({ error: 'Erro ao obter significado da palavra.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

async function getMeaning(word: string): Promise<string> {
  const url = `https://www.dicio.com.br/${word}`;
  const response = await axios.get(url);

  if (response.status === 200) {
    const $: CheerioAPI = cheerio.load(response.data);

    // Extrair apenas o significado da palavra
    const meaning = $('.significado').first().text().trim();

    return meaning || 'Significado não encontrado.';
  } else {
    throw new Error('Erro ao obter a página.');
  }
}
