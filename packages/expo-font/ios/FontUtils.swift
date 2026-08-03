import CoreGraphics

/**
 * Queries custom native font names from the Info.plist `UIAppFonts`.
 */
internal func queryCustomNativeFonts() -> [String] {
  // [0] Read from main bundle's Info.plist
  guard let fontFilePaths = Bundle.main.object(forInfoDictionaryKey: "UIAppFonts") as? [String] else {
    return []
  }

  // [1] Get font family names for each font file. A variable font file has one descriptor per named
  // instance of its variation axes, and they all share a family name, so the family names are
  // deduplicated to avoid looking up — and returning — the same family once per instance.
  var fontFamilyNames = [String]()

  for fontFilePath in fontFilePaths {
    guard let fontUrl = Bundle.main.url(forResource: fontFilePath, withExtension: nil),
      let fontDescriptors = CTFontManagerCreateFontDescriptorsFromURL(fontUrl as CFURL) as? [CTFontDescriptor] else {
      continue
    }
    for descriptor in fontDescriptors {
      guard let fontFamilyName = CTFontDescriptorCopyAttribute(descriptor, kCTFontFamilyNameAttribute) as? String else {
        continue
      }
      if !fontFamilyNames.contains(fontFamilyName) {
        fontFamilyNames.append(fontFamilyName)
      }
    }
  }

  // [2] Retrieve font names by family names
  return fontFamilyNames.flatMap { fontFamilyName in
  #if os(iOS) || os(tvOS)
    return UIFont.fontNames(forFamilyName: fontFamilyName)
  #elseif os(macOS)
    return NSFontManager.shared.availableMembers(ofFontFamily: fontFamilyName)?.compactMap { $0[0] as? String } ?? []
  #endif
  }
}

/**
 Returns the PostScript names to register an alias for, for the file at the given url.

 A variable font file exposes each of the named instances of its variation axes under its own
 PostScript name, and returning all of them is what lets React Native match `fontWeight` against
 the weights the font actually provides. Core Text does that expansion when the font is registered,
 so the axes don't need to be read out of the font binary.

 The file's default instance comes first, matching how ``UIFont.fontNames(forFamilyName:)`` orders
 a family. React Native falls back to the first name when no font matches the requested traits —
 an italic style against a font with only upright instances, for example — so the first name has to
 be the default weight rather than whichever instance Core Text happened to list first.

 Every other file resolves to the single name of its default font, which leaves the alias behaving
 as it did before variable fonts were handled: ``UIFont/_expo_fontNames(forFamilyName:)`` looks that
 name up as a family name, so fonts registered elsewhere under the same family stay reachable
 through the alias. A font collection takes this path too. It holds several fonts but declares no
 variation axes, and widening it here would change what already-shipped apps render.
 */
internal func fontNames(inFileAt url: CFURL, alias: String) throws -> [String] {
  guard let fontDescriptors = CTFontManagerCreateFontDescriptorsFromURL(url) as? [CTFontDescriptor] else {
    throw FontCreationFailedException(alias)
  }

  var fontNames = fontDescriptors.compactMap { descriptor in
    return CTFontDescriptorCopyAttribute(descriptor, kCTFontNameAttribute) as? String
  }

  if fontNames.isEmpty {
    throw FontNoPostScriptException(alias)
  }

  // ``CGFont`` reports the default instance of a variable font, which is the one to move up front.
  let defaultFontName = CGDataProvider(url: url).flatMap { CGFont($0)?.postScriptName as String? }

  let hasVariationAxes = fontDescriptors.contains { descriptor in
    let axes = CTFontDescriptorCopyAttribute(descriptor, kCTFontVariationAxesAttribute) as? [Any]
    return !(axes?.isEmpty ?? true)
  }

  if hasVariationAxes, fontNames.count > 1 {
    if let defaultFontName, let defaultIndex = fontNames.firstIndex(of: defaultFontName) {
      fontNames.remove(at: defaultIndex)
      fontNames.insert(defaultFontName, at: 0)
    }
    return fontNames
  }

  return [defaultFontName ?? fontNames[0]]
}

/**
 Registers the given font to make it discoverable through font descriptor matching.
 */
internal func registerFont(fontUrl: CFURL, fontFamilyAlias: String) throws {
  var error: Unmanaged<CFError>?

  if !CTFontManagerRegisterFontsForURL(fontUrl, .process, &error), let error = error?.takeRetainedValue() {
    let fontError = CTFontManagerError(rawValue: CFErrorGetCode(error))

    switch fontError {
    case .alreadyRegistered, .duplicatedName:
      // Ignore the error if:
      // - this exact font instance was already registered or
      // - another instance already registered with the same name (assuming it's most likely the same font anyway)
      return
    default:
      throw FontRegistrationFailedException(FontRegistrationErrorInfo(fontFamilyAlias: fontFamilyAlias, cfError: error, ctFontManagerError: fontError))
    }
  }
}

/**
 Unregisters the given font, so the app will no longer be able to render it.
 Returns a boolean indicating if the font is successfully unregistered after this function completes.
 */
internal func unregisterFont(url: CFURL) throws -> Bool {
  var error: Unmanaged<CFError>?

  if !CTFontManagerUnregisterFontsForURL(url, .process, &error), let error = error?.takeRetainedValue() {
    if let ctFontManagerError = CTFontManagerError(rawValue: CFErrorGetCode(error as CFError)) {
      return switch ctFontManagerError {
      case .systemRequired, .inUse:
        false
      case .notRegistered:
        true
      default:
        throw UnregisteringFontFailedException(error)
      }
    }
  }
  return true
}
