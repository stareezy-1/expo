import ExpoModulesCore

/**
 A registry of font family aliases mapped to the PostScript names they were loaded from.
 A static font contributes a single name, whereas a variable font contributes one per named instance.
 */
private var fontFamilyAliases = [String: [String]]()

/**
 A flag that is set to `true` when the ``UIFont.fontNames(forFamilyName:)`` is already swizzled.
 */
private var hasSwizzled = false

/**
 Queue to protect shared resources
 */
private let queue = DispatchQueue(label: "expo.fontfamilyaliasmanager", attributes: .concurrent)

/**
 Manages the font family aliases and swizzles the `UIFont` class.
 */
internal struct FontFamilyAliasManager {
  /**
   Whether the given alias has already been set.
   */
  internal static func hasAlias(_ familyNameAlias: String) -> Bool {
    return queue.sync {
      fontFamilyAliases[familyNameAlias] != nil
    }
  }

  /**
   Sets the alias for the given PostScript names.
   If the alias has already been set, its font names will be overridden.
   */
  internal static func setAlias(_ familyNameAlias: String, forFonts fontNames: [String]) {
    maybeSwizzleUIFont()
    queue.sync(flags: .barrier) {
      fontFamilyAliases[familyNameAlias] = fontNames
    }
  }

  /**
   Returns the PostScript names for the given alias or `nil` when it's not set yet.
   */
  internal static func fontNames(forAlias familyNameAlias: String) -> [String]? {
    return queue.sync {
      fontFamilyAliases[familyNameAlias]
    }
  }
}

/**
 Swizzles ``UIFont.fontNames(forFamilyName:)`` to support font family aliases.
 This is necessary because the user provides a custom family name that is then used in stylesheets,
 however the font usually has a different name encoded in the binary, thus the system may use a different name.
 */
private func maybeSwizzleUIFont() {
  if hasSwizzled {
    return
  }
#if !os(macOS)
  let originalFontNamesMethod = class_getClassMethod(UIFont.self, #selector(UIFont.fontNames(forFamilyName:)))
  let newFontNamesMethod = class_getClassMethod(UIFont.self, #selector(UIFont._expo_fontNames(forFamilyName:)))

  if let originalFontNamesMethod, let newFontNamesMethod {
    method_exchangeImplementations(originalFontNamesMethod, newFontNamesMethod)
  } else {
    log.error("expo-font is unable to swizzle `UIFont.fontNames(forFamilyName:)`")
  }
#endif
  hasSwizzled = true
}
