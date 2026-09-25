import { describe, expect, it } from 'vitest';
import { auraTrailers } from './git.js';

describe('commit trailers', () => {
  it('credits AURA and links the Task and run, the developer stays the author', () => {
    expect(auraTrailers('KAN-45', 'CODE-abc')).toEqual(['Co-authored-by: AURA Coding Council <aura@localhost>', 'AURA-Task: KAN-45', 'AURA-Run: CODE-abc']);
  });

  it('omits the run trailer when no run is known', () => {
    expect(auraTrailers('KAN-45')).toEqual(['Co-authored-by: AURA Coding Council <aura@localhost>', 'AURA-Task: KAN-45']);
  });
});
