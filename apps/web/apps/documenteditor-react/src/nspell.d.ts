declare module "nspell" {
  interface NSpellInstance {
    correct(word: string): boolean
    suggest(word: string): string[]
    add(word: string): void
    remove(word: string): void
    spell(word: string): boolean
  }
  type NSpellConstructor = (aff: BufferSource, dic: BufferSource) => NSpellInstance
  const nspell: NSpellConstructor
  export default nspell
}
