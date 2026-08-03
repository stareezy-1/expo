#if !os(macOS)
/**
 An extension to ``UIFont`` that adds a custom implementation of `fontNames(forFamilyName:)` that supports aliasing font families.
 */
public extension UIFont {
  /**
   Returns an array of font names for the specified family name or its alias.
   */
  @objc
  static dynamic func _expo_fontNames(forFamilyName familyName: String) -> [String] {
    // Get font names from the original function.
    let fontNames = UIFont._expo_fontNames(forFamilyName: familyName)

    // If no font names were found, the name may be an alias rather than a family name encoded in a
    // font binary, so resolve it against the PostScript names that were loaded under it.
    if fontNames.isEmpty, let aliasedFontNames = FontFamilyAliasManager.fontNames(forAlias: familyName) {
      // Only a variable font stored more than one name: ``fontNames(inFileAt:alias:)`` records one
      // per named instance for those, and a single name for every other file. Handing the whole set
      // back is what lets RN match `fontWeight` against the weights the font really has.
      if aliasedFontNames.count > 1 {
        return aliasedFontNames
      }

      guard let postScriptName = aliasedFontNames.first else {
        return fontNames
      }

      // Every other font keeps the original lookup. The PostScript name is tried as a family name
      // first, so fonts registered under that family elsewhere stay reachable through the alias,
      // and the name itself is returned when it isn't a family name.
      let familyFontNames = UIFont._expo_fontNames(forFamilyName: postScriptName)
      return familyFontNames.isEmpty ? [postScriptName] : familyFontNames
    }

    return fontNames
  }
}
#endif
