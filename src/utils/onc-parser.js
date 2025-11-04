/**
 * ONC Ontology Parser
 *
 * Parses and queries the ONC (Ontology for Neurosensory Consciousness) vocabulary
 * Loads Turtle (.ttl) RDF format and provides search/browse capabilities
 *
 * Usage:
 *   import { ONCParser } from './src/utils/onc-parser.js';
 *   const onc = new ONCParser();
 *   await onc.load('/rdf/Attachment 2_ONC_Ontology.ttl');
 *   const results = onc.search('binaural');
 */

export class ONCParser {
  constructor() {
    this.raw = '';
    this.triples = [];
    this.entities = new Map();
    this.loaded = false;
  }

  /**
   * Load ONC ontology from TTL file
   * @param {string} url - Path to .ttl file
   */
  async load(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ONC: ${response.status}`);
      }

      this.raw = await response.text();
      this._parse();
      this.loaded = true;

      console.log('[ONCParser] Loaded', {
        size: this.raw.length,
        triples: this.triples.length,
        entities: this.entities.size,
      });

      return true;
    } catch (error) {
      console.error('[ONCParser] Load failed:', error);
      return false;
    }
  }

  /**
   * Simple TTL parser (basic implementation)
   * For production, consider using a library like rdflib.js or N3.js
   */
  _parse() {
    const lines = this.raw.split('\n');
    const currentSubject = null;
    const currentPredicate = null;

    for (let line of lines) {
      line = line.trim();

      // Skip comments and empty lines
      if (!line || line.startsWith('#')) continue;

      // Skip prefixes for now (simple parser)
      if (line.startsWith('@prefix') || line.startsWith('@base')) continue;

      // Extract triples (very simplified)
      // Format: <subject> <predicate> <object> .
      const tripleMatch = line.match(/<([^>]+)>\s+<([^>]+)>\s+(.+?)\s*[;.]$/);
      if (tripleMatch) {
        const [, subject, predicate, object] = tripleMatch;

        this.triples.push({ subject, predicate, object });

        // Index entities
        if (!this.entities.has(subject)) {
          this.entities.set(subject, {
            uri: subject,
            properties: new Map(),
          });
        }

        const entity = this.entities.get(subject);
        if (!entity.properties.has(predicate)) {
          entity.properties.set(predicate, []);
        }
        entity.properties.get(predicate).push(object);
      }
    }
  }

  /**
   * Search ontology by keyword
   * @param {string} query - Search term
   * @returns {Array} Matching entities
   */
  search(query) {
    if (!this.loaded) return [];

    const lowerQuery = query.toLowerCase();
    const results = [];

    for (const [uri, entity] of this.entities) {
      // Search in URI
      if (uri.toLowerCase().includes(lowerQuery)) {
        results.push(entity);
        continue;
      }

      // Search in properties
      for (const [pred, values] of entity.properties) {
        if (pred.toLowerCase().includes(lowerQuery)) {
          results.push(entity);
          break;
        }

        for (const val of values) {
          if (String(val).toLowerCase().includes(lowerQuery)) {
            results.push(entity);
            break;
          }
        }
      }
    }

    return results;
  }

  /**
   * Get entity by URI
   */
  getEntity(uri) {
    return this.entities.get(uri);
  }

  /**
   * Get all entities
   */
  getAllEntities() {
    return Array.from(this.entities.values());
  }

  /**
   * Get entities by type
   * @param {string} type - RDF type URI (e.g., 'owl:Class')
   */
  getByType(type) {
    const results = [];

    for (const entity of this.entities.values()) {
      const types =
        entity.properties.get('rdf:type') ||
        entity.properties.get('a') ||
        entity.properties.get('http://www.w3.org/1999/02/22-rdf-syntax-ns#type') ||
        [];

      if (types.some((t) => t.includes(type))) {
        results.push(entity);
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      loaded: this.loaded,
      fileSize: this.raw.length,
      totalTriples: this.triples.length,
      totalEntities: this.entities.size,
    };
  }
}

// Singleton instance
export const oncParser = new ONCParser();
