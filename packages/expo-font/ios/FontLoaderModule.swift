import ExpoModulesCore

public final class FontLoaderModule: Module {
  // could be a Set, but to be able to pass to JS we keep it as an array
  private lazy var registeredFonts: [String] = queryCustomNativeFonts()

  public required init(appContext: AppContext) {
    super.init(appContext: appContext)
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoFontLoader")

    // NOTE: this is exposed in JS as globalThis.expo.modules.ExpoFontLoader.loadedFonts
    // and potentially consumed outside of Expo (e.g. RN vector icons)
    // do NOT change the property as it'll break consumers!
    Function("getLoadedFonts") {
      return registeredFonts
    }

    // NOTE: this is exposed in JS as globalThis.expo.modules.ExpoFontLoader.loadAsync
    // and potentially consumed outside of Expo (e.g. RN vector icons)
    // do NOT change the function signature as it'll break consumers!
    AsyncFunction("loadAsync") { (fontFamilyAlias: String, localUri: URL) in
      let fontUrl = localUri as CFURL
      // If the font was already registered, unregister it first. Otherwise CTFontManagerRegisterFontsForURL
      // would fail because of a duplicated font name when the app reloads or someone wants to override a font.
      if FontFamilyAliasManager.hasAlias(fontFamilyAlias) {
        guard try unregisterFont(url: fontUrl) else {
          return
        }
      }

      // Register the font
      try registerFont(fontUrl: fontUrl, fontFamilyAlias: fontFamilyAlias)

      // Alias every PostScript name the file provides, not only its default one. A variable font
      // provides one per named instance, so this is what makes its weights reachable through
      // `fontWeight`.
      let fontNames = try fontNames(inFileAt: fontUrl, alias: fontFamilyAlias)

      FontFamilyAliasManager.setAlias(fontFamilyAlias, forFonts: fontNames)
      registeredFonts = Array(Set(registeredFonts).union(fontNames + [fontFamilyAlias]))
    }
  }
}
